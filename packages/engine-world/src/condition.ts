import type { Fighter } from '@bm/core-model';
import { CAMP_TUNING, CONDITION_TUNING, campPhaseFor } from '@bm/data';
import type { Camp, CampPlanEntry, ConditionChange, World } from './types.js';

/**
 * Динаміка форми (ADR-0022). Форма живе **між боями**, у світі, а не в рушії бою:
 * рушій отримує зліпок і нічого не змінює (ADR-0014).
 *
 * Тут немає жодного звернення до `rng`: за тих самих подій і того самого календаря
 * форма однакова. Це прямо перевіряється тестом на детермінізм сезону.
 */

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Округлення до десятої: форма зберігається в сейві, і дробовий хвіст там не потрібен. */
const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Стеля гостроти залежить від бійця, а не від календаря: скільки він здатен із себе
 * витиснути в таборі. `workRate` — скільки роботи, `professionalism` — чи доробить
 * її до кінця (прихований атрибут, гравцю не показується).
 */
export function sharpnessCeiling(fighter: Fighter): number {
  const t = CONDITION_TUNING.sharpness;
  return clamp(
    t.ceilingBase
      + fighter.attributes.workRate * t.ceilingPerWorkRate
      + fighter.attributes.professionalism * t.ceilingPerProfessionalism,
    t.floor, 100,
  );
}

/**
 * Найближчий призначений бій для кожного бійця. Рахується один раз на день:
 * у циклі по бійцях це була б функція від усього календаря на кожного.
 */
export function nextFightIndex(world: World): Map<string, { day: number; fightId: string }> {
  const index = new Map<string, { day: number; fightId: string }>();
  for (const fight of world.schedule) {
    for (const id of [fight.aId, fight.bId]) {
      const current = index.get(id);
      if (current === undefined || fight.day < current.day) {
        index.set(id, { day: fight.day, fightId: fight.id });
      }
    }
  }
  return index;
}

/**
 * Що робить табір цього дня: множники до набору гостроти, до втоми і до ризику травми
 * (ADR-0023). Для бійця без табору — нейтральні одиниці, тобто поведінка ADR-0022
 * без змін: боєць ШІ тренується так само, як тренувався до появи рішень гравця.
 */
export interface CampEffect {
  sharpness: number;
  fatigue: number;
  injury: number;
}

export const NEUTRAL_CAMP: CampEffect = { sharpness: 1, fatigue: 1, injury: 1 };

/** План фази: рішення гравця, а якщо його немає — замовчування тренера. */
export function campEntryFor(camp: Camp | undefined, daysToFight: number): CampPlanEntry | null {
  const phase = campPhaseFor(daysToFight);
  if (phase === null) return null;
  return camp?.phases[phase] ?? CAMP_TUNING.defaults[phase];
}

export function campEffect(camp: Camp | undefined, daysToFight: number): CampEffect {
  const entry = campEntryFor(camp, daysToFight);
  if (entry === null) return NEUTRAL_CAMP;
  const focus = CAMP_TUNING.focus[entry.focus];
  const load = CAMP_TUNING.load[entry.load];
  if (!focus || !load) return NEUTRAL_CAMP;
  return {
    sharpness: focus.sharpness * load.sharpness,
    fatigue: focus.fatigue * load.fatigue,
    injury: focus.injury * load.injury,
  };
}

export interface DailyCondition {
  changes: readonly ConditionChange[];
  /** Бійці, у яких табір відкривається саме сьогодні. */
  campsOpened: readonly { fighterId: string; fightId: string }[];
}

/**
 * Один день форми для всього світу.
 *
 * Повертає **лише тих, у кого форма змінилася**. Це не оптимізація заради оптимізації:
 * боєць у рівновазі (гострота на підлозі, свіжість на стелі) не змінюється роками,
 * і копіювати його щодня означало б мільйони зайвих об'єктів за прогін.
 */
export function advanceCondition(
  world: World, day: number, index = nextFightIndex(world),
): DailyCondition {
  const sharp = CONDITION_TUNING.sharpness;
  const fresh = CONDITION_TUNING.freshness;
  const schedule = index;

  const campOf = new Map(world.camps.map((c) => [c.fighterId, c]));

  const changes: ConditionChange[] = [];
  const campsOpened: { fighterId: string; fightId: string }[] = [];

  for (const fighter of Object.values(world.fighters)) {
    const next = schedule.get(fighter.id);
    const daysToFight = next === undefined ? Infinity : next.day - day;
    const inCamp = daysToFight > 0 && daysToFight <= sharp.campWindowDays;

    if (inCamp && daysToFight === sharp.campWindowDays && next !== undefined) {
      campsOpened.push({ fighterId: fighter.id, fightId: next.fightId });
    }

    // План фази діє лише в таборі; поза ним множники нейтральні.
    const effect = inCamp ? campEffect(campOf.get(fighter.id), daysToFight) : NEUTRAL_CAMP;

    const ceiling = sharpnessCeiling(fighter);
    const sharpness = inCamp
      ? Math.min(ceiling, fighter.condition.sharpness + sharp.campGainPerDay * effect.sharpness)
      : Math.max(sharp.floor, fighter.condition.sharpness - sharp.idleDecayPerDay);

    const recovery = fresh.recoveryPerDay + fighter.attributes.recovery * fresh.recoveryPerAttribute;
    const freshness = clamp(
      fighter.condition.freshness + recovery
        - (inCamp ? fresh.campFatiguePerDay * effect.fatigue : 0),
      fresh.floor, fresh.max,
    );

    const nextSharpness = round1(sharpness);
    const nextFreshness = round1(freshness);
    if (nextSharpness === fighter.condition.sharpness && nextFreshness === fighter.condition.freshness) continue;
    changes.push({ fighterId: fighter.id, sharpness: nextSharpness, freshness: nextFreshness });
  }

  // Порядок у подіях фіксується сортуванням за id, а не порядком у мапі бійців:
  // після відкриття сейву ключі приходять упорядкованими, і стрічка подій мусить
  // збігатися байт у байт (ADR-0003, ADR-0013). Цю розбіжність спіймав тест сейву.
  changes.sort((x, y) => (x.fighterId < y.fighterId ? -1 : 1));
  campsOpened.sort((x, y) => (x.fighterId < y.fighterId ? -1 : 1));
  return { changes, campsOpened };
}

/** Провал форми після бою: свіжість падає, гострота навпаки зростає — боєць у бойовому ритмі. */
export function conditionAfterFight(
  fighter: Fighter, rounds: number, headDelta: number,
): ConditionChange {
  const sharp = CONDITION_TUNING.sharpness;
  const fresh = CONDITION_TUNING.freshness;
  const drop = fresh.postFightBase
    + rounds * fresh.postFightPerRound
    + headDelta * fresh.postFightPerHeadDelta;
  return {
    fighterId: fighter.id,
    sharpness: round1(Math.min(sharpnessCeiling(fighter), fighter.condition.sharpness + sharp.fightGain)),
    freshness: round1(clamp(fighter.condition.freshness - drop, fresh.floor, fresh.max)),
  };
}
