import { createRng, deriveSeed, type Rng } from '@bm/core-model';
import { WEIGHT_CLASSES } from '@bm/data';
import { dispatch } from './event-bus.js';
import { HANDLERS } from './handlers.js';
import { resolveFight } from './resolve-fight.js';
import { advanceCondition } from './condition.js';
import { buildTierIndex, fightTier } from './tiers.js';
import { publishRankings } from './rankings.js';
import { civilFromDays } from './calendar.js';
import { SANCTIONING_BODIES } from '@bm/data';
import type { PlayerCommand, World, WorldEvent } from './types.js';

const GROUP_OF: Record<string, string> = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));

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
): { world: World; events: WorldEvent[] } {
  // Команди гравця застосовуються до тіку: вони описують намір на майбутнє.
  let current: World = world;
  for (const command of commands) {
    if (command.t === 'scheduleFight') {
      current = { ...current, schedule: [...current.schedule, command.fight] };
    }
  }

  const day = current.day + 1;
  current = { ...current, day };

  // Форма рухається **до** боїв дня: боєць виходить у ринг у сьогоднішній формі,
  // а не у вчорашній. Окремий dispatch, бо результат потрібен уже під час симуляції (ADR-0022).
  const daily = advanceCondition(current, day);
  const conditionEvents: WorldEvent[] = [
    { t: 'DayAdvanced', day },
    { t: 'ConditionAdvanced', day, changes: daily.changes },
    ...daily.campsOpened.map((camp): WorldEvent => ({
      t: 'FighterCampStarted', fighterId: camp.fighterId, fightId: camp.fightId, day,
    })),
  ];
  const before = dispatch(current, conditionEvents, HANDLERS);
  current = before.world;

  const due = current.schedule.filter((f) => f.day === day);
  const remaining = current.schedule.filter((f) => f.day !== day);
  current = { ...current, schedule: remaining };

  const tierIndex = buildTierIndex(current);
  const initial: WorldEvent[] = [];

  // Порядок боїв фіксується сортуванням за id: порядок у масиві не є частиною стану.
  for (const fight of [...due].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const a = current.fighters[fight.aId];
    const b = current.fighters[fight.bId];
    if (!a || !b) continue;

    const tier = fightTier(tierIndex, fight.aId, fight.bId);
    const group = GROUP_OF[a.constants.naturalWeightClassId] ?? 'middle';
    // Власний потік випадковості на бій: додавання боїв не зсуває решту світу.
    const fightRng = createRng(deriveSeed(current.seed, `fight/${fight.id}`));
    const resolved = resolveFight(tier, a, b, fight.scheduledRounds, fightRng, group);

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
    });
  }

  // Рейтинги публікуються раз на місяць, першого числа (ADR-0018): так дешевше
  // і так само працює реальний бокс.
  if (civilFromDays(day).day === 1) {
    current = { ...current, rankings: publishRankings(current), rankingsPublishedOn: day };
    for (const body of SANCTIONING_BODIES) {
      initial.push({ t: 'RankingsPublished', day, bodyId: body.id });
    }
  }

  const after = dispatch(current, initial, HANDLERS);
  return { world: after.world, events: [...before.events, ...after.events] };
}
