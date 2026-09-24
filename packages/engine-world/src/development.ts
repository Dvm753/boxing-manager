import {
  createRng, deriveSeed, normalize,
  MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES,
  type Attributes, type Fighter,
} from '@bm/core-model';
import { DEVELOPMENT_TUNING, WEIGHT_CLASSES, type AttributeGroup } from '@bm/data';
import { civilFromDays } from './calendar.js';
import { campEntryFor, nextFightIndex } from './condition.js';
import type { World, WorldEvent } from './types.js';

/**
 * Розвиток і старіння бійця (ADR-0031). Чиста функція дня: повертає **події**, стан
 * змінюють обробники (ADR-0016). Випадковість — власний потік на бійця й день
 * (`dev/<id>/<day>`), як у боїв (ADR-0003): додавання бійця не зсуває розвиток решти.
 *
 * **Стан 2026-09-24:** модуль і обробник подій готові, але ще **не підключені** до
 * `advanceDay` — підключення ламає два наявні тести (див. `STATE.md`, «Заблоковано»),
 * і рішення щодо них за власником.
 *
 * Розвиваються лише видимі групи (технічні, фізичні, ментальні). Приховані атрибути —
 * характер (схильність до травм, «брудність», професійність) — не ростуть і не старіють.
 */
const GROUPS: Record<AttributeGroup, readonly string[]> = {
  technical: TECHNICAL_ATTRIBUTES, physical: PHYSICAL_ATTRIBUTES, mental: MENTAL_ATTRIBUTES,
};
const GROUP_OF_WEIGHT: Record<string, string> =
  Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));

/** Детерміноване ціле з id бійця — день народження, індивідуальний пік, стеля в межах діапазону. */
const hashOf = (fighterId: string, label: string): number => deriveSeed(0, `${label}/${fighterId}`) >>> 0;

/** День народження як (місяць, день) — похідний від id, нового поля в сейві не потрібно. */
export function birthdayOf(fighterId: string): { month: number; day: number } {
  const h = hashOf(fighterId, 'birthday');
  return { month: 1 + (h % 12), day: 1 + ((h >>> 4) % 28) };
}

/** Вік піку: група ваги + індивідуальний розкид. */
export function peakAgeOf(fighter: Fighter): number {
  const t = DEVELOPMENT_TUNING.peakAge;
  const base = t.byGroup[GROUP_OF_WEIGHT[fighter.constants.naturalWeightClassId] ?? 'middle'] ?? 29;
  const spread = (hashOf(fighter.id, 'peak') % (2 * t.spread + 1)) - t.spread;
  return base + spread;
}

/** Прихована стеля — точка в межах показаного гравцю діапазону `potentialRange`. */
export function hiddenCeilingOf(fighter: Fighter): number {
  const [lo, hi] = fighter.potentialRange;
  return lo + (hashOf(fighter.id, 'ceiling') % (hi - lo + 1));
}

/** Середній рівень видимих атрибутів — те, з чим порівнюється стеля. */
export function developedAbility(attributes: Attributes): number {
  let sum = 0;
  let n = 0;
  for (const keys of Object.values(GROUPS)) {
    for (const key of keys) { sum += attributes[key as keyof Attributes]; n++; }
  }
  return sum / n;
}

/** Дні народження сьогодні — вік +1. */
export function agingEvents(world: World, day: number): WorldEvent[] {
  const today = civilFromDays(day);
  const events: WorldEvent[] = [];
  for (const fighter of Object.values(world.fighters)) {
    const b = birthdayOf(fighter.id);
    if (b.month === today.month && b.day === today.day) {
      events.push({ t: 'FighterAged', fighterId: fighter.id, day, age: fighter.age + 1 });
    }
  }
  return events;
}

/**
 * Тижневий тік розвитку. Кожен видимий атрибут має малий шанс +1 (до піку, поки нижче
 * стелі) або −1 (після піку). Крок завжди ±1 — за 12 тижнів це реалістичні +1…+3 у
 * молодого таланту і −1…−3 у ветерана.
 */
export function developmentEvents(world: World, day: number): WorldEvent[] {
  const t = DEVELOPMENT_TUNING;
  if (day % t.tickEveryDays !== 0) return [];
  const schedule = nextFightIndex(world);
  const events: WorldEvent[] = [];

  for (const fighter of Object.values(world.fighters)) {
    const rng = createRng(deriveSeed(world.seed, `dev/${fighter.id}/${day}`));
    const peak = peakAgeOf(fighter);
    const changes: Record<string, number> = {};

    // Фокус поточної фази табору (ADR-0023) — підсилює ріст «своєї» групи.
    const next = schedule.get(fighter.id);
    const camp = next === undefined ? undefined : world.camps.find((c) => c.fightId === next.fightId);
    const entry = next === undefined ? null : campEntryFor(camp, next.day - day);
    const focusGroup = entry === null ? undefined : t.focusGroups[entry.focus];

    if (fighter.age < peak) {
      const ceiling = hiddenCeilingOf(fighter);
      const room = ceiling - developedAbility(fighter.attributes);
      if (room > 0) {
        const youth = Math.min(t.growth.maxYouth, Math.max(t.growth.minYouth, (peak - fighter.age) / t.growth.youthSpanYears));
        const taper = Math.min(1, room / t.growth.taperPoints);
        const work = 1 - t.growth.workRateWeight + t.growth.workRateWeight * 2
          * (normalize(fighter.attributes.workRate) + normalize(fighter.attributes.professionalism)) / 2;
        for (const [group, keys] of Object.entries(GROUPS) as [AttributeGroup, readonly string[]][]) {
          const focus = focusGroup === group ? t.growth.focusMultiplier : 1;
          const chance = t.growth.base * youth * taper * work * focus;
          for (const key of keys) {
            const value = fighter.attributes[key as keyof Attributes];
            if (value < 20 && rng.next() < chance) changes[key] = 1;
          }
        }
      }
    } else if (fighter.age > peak) {
      const years = fighter.age - peak;
      for (const [group, keys] of Object.entries(GROUPS) as [AttributeGroup, readonly string[]][]) {
        for (const key of keys) {
          const chance = t.decline.base * years * t.decline.groupWeight[group];
          const value = fighter.attributes[key as keyof Attributes];
          if (value > 1 && rng.next() < chance) changes[key] = -1;
        }
      }
      // Щелепа — прихований атрибут, але саме вона з віком і зносом «сиплеться» першою.
      const chinChance = t.decline.base * years
        * (t.decline.groupWeight.physical + fighter.wear.headTrauma * t.decline.chinPerHeadTrauma);
      if (fighter.attributes.chin > 1 && rng.next() < chinChance) changes['chin'] = -1;
    }

    if (Object.keys(changes).length > 0) {
      events.push({ t: 'FighterDeveloped', fighterId: fighter.id, day, changes });
    }
  }
  return events;
}
