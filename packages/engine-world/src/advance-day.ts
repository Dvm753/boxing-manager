import { createRng, deriveSeed, type Rng } from '@bm/core-model';
import { WEIGHT_CLASSES } from '@bm/data';
import { dispatch } from './event-bus.js';
import { HANDLERS } from './handlers.js';
import { resolveFight } from './resolve-fight.js';
import { advanceCondition, nextFightIndex } from './condition.js';
import { advanceDecisions, applyCommands, campInjuries } from './decisions.js';
import { buildTierIndex, fightTier } from './tiers.js';
import { publishRankings } from './rankings.js';
import { checkMandatoryDefenses } from './titles.js';
import { civilFromDays } from './calendar.js';
import { SANCTIONING_BODIES } from '@bm/data';
import type { FightEvent } from '@bm/engine-fight';
import type { PlayerCommand, World, WorldEvent } from './types.js';

const GROUP_OF: Record<string, string> = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));

/**
 * Результат дня. `titleFightLogs` — лог кожного титульного бою цього дня за `fight.id`;
 * **не частина стану світу** і в сейв не йде (зберігати логи чи ні — Q25). Додаткове
 * поле: наявні виклики, що читають лише `world` і `events`, не змінюються.
 */
export interface DayResult {
  world: World;
  events: WorldEvent[];
  titleFightLogs: Record<string, readonly FightEvent[]>;
}

/**
 * Тік дня (ADR-0016). Не змінює стан напряму — **породжує події**, які застосовують обробники.
 * Квант часу — день; сигнатура зафіксована ADR-0002 і `MODULE_CONTRACTS.md`.
 */
export function advanceDay(
  world: World,
  commands: readonly PlayerCommand[],
  /**
   * Потік випадковості світу. Наразі не використовується: кожен бій отримує **власний**
   * потік, похідний від `world.seed` і `fight.id`, щоб додавання бою в календар
   * не зсувало результати всіх інших боїв. Параметр лишається в сигнатурі — він
   * знадобиться для подій рівня світу (травми на тренуванні, рішення ШІ).
   */
  _rng: Rng,
): DayResult {
  // Команди застосовуються до тіку: вони описують намір на майбутнє. Бій за участю
  // підопічного тут не потрапляє в календар — він стає пропозицією (ADR-0023).
  const applied = applyCommands(world, commands, world.day);
  let current: World = applied.world;

  const day = current.day + 1;
  current = { ...current, day };

  // Черга рішень: прострочені закриваються, нові фази табору відкриваються.
  const queue = advanceDecisions(current, day);
  current = queue.world;

  // Форма рухається **до** боїв дня: боєць виходить у ринг у сьогоднішній формі,
  // а не у вчорашній. Окремий dispatch, бо результат потрібен уже під час симуляції (ADR-0022).
  // Індекс найближчих боїв рахується один раз на день: його читають і форма, і травми.
  const scheduleIndex = nextFightIndex(current);
  const daily = advanceCondition(current, day, scheduleIndex);
  const conditionEvents: WorldEvent[] = [
    { t: 'DayAdvanced', day },
    ...applied.events,
    ...queue.events,
    { t: 'ConditionAdvanced', day, changes: daily.changes },
    ...daily.campsOpened.map((camp): WorldEvent => ({
      t: 'FighterCampStarted', fighterId: camp.fighterId, fightId: camp.fightId, day,
    })),
    ...campInjuries(current, day, scheduleIndex),
  ];
  const before = dispatch(current, conditionEvents, HANDLERS);
  current = before.world;

  const due = current.schedule.filter((f) => f.day === day);
  const remaining = current.schedule.filter((f) => f.day !== day);
  current = { ...current, schedule: remaining };

  const tierIndex = buildTierIndex(current);
  const initial: WorldEvent[] = [];
  const titleFightLogs: Record<string, readonly FightEvent[]> = {};

  // Порядок боїв фіксується сортуванням за id: порядок у масиві не є частиною стану.
  for (const fight of [...due].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const a = current.fighters[fight.aId];
    const b = current.fighters[fight.bId];
    if (!a || !b) continue;

    // Титульний бій — завжди повна симуляція: це бій, який світ і гравець мають
    // побачити й розповісти, а не лише отримати результат наближення (ADR-0015, ADR-0026).
    const tier = fight.titleKey !== undefined ? 1 : fightTier(tierIndex, fight.aId, fight.bId);
    const group = GROUP_OF[a.constants.naturalWeightClassId] ?? 'middle';
    // Власний потік випадковості на бій: додавання боїв не зсуває решту світу.
    const fightRng = createRng(deriveSeed(current.seed, `fight/${fight.id}`));
    // План бере той із таборів, чий це бій: у бійців ШІ таборів і планів немає.
    const camp = current.camps.find((c) => c.fightId === fight.id);
    const plans = camp?.plan === undefined ? {} : camp.fighterId === fight.aId
      ? { a: camp.plan } : { b: camp.plan };
    const resolved = resolveFight(tier, a, b, fight.scheduledRounds, fightRng, group, plans);
    if (fight.titleKey !== undefined && resolved.eventLog) titleFightLogs[fight.id] = resolved.eventLog;

    initial.push({
      t: 'FightCompleted',
      fightId: fight.id,
      day,
      aId: fight.aId,
      bId: fight.bId,
      method: resolved.method,
      winnerId: resolved.winner === null ? null : resolved.winner === 'a' ? fight.aId : fight.bId,
      endingRound: resolved.endingRound,
      scheduledRounds: fight.scheduledRounds,
      tier: resolved.tier,
      ...(fight.titleKey === undefined ? {} : { titleKey: fight.titleKey }),
    });
  }

  // Рейтинги публікуються раз на місяць, першого числа (ADR-0018): так дешевше
  // і так само працює реальний бокс. Обов'язкові захисти (ADR-0026) перевіряються
  // тим самим тактом: комісії не звіряють дедлайни щодня.
  if (civilFromDays(day).day === 1) {
    current = { ...current, rankings: publishRankings(current), rankingsPublishedOn: day };
    for (const body of SANCTIONING_BODIES) {
      initial.push({ t: 'RankingsPublished', day, bodyId: body.id });
    }
    initial.push(...checkMandatoryDefenses(current, day));
  }

  const after = dispatch(current, initial, HANDLERS);
  return { world: after.world, events: [...before.events, ...after.events], titleFightLogs };
}
