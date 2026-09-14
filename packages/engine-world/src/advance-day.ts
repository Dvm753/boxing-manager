import { createRng, deriveSeed, type Rng } from '@bm/core-model';
import { WEIGHT_CLASSES } from '@bm/data';
import { dispatch } from './event-bus.js';
import { HANDLERS } from './handlers.js';
import { resolveFight } from './resolve-fight.js';
import { buildTierIndex, fightTier } from './tiers.js';
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

  const due = current.schedule.filter((f) => f.day === day);
  const remaining = current.schedule.filter((f) => f.day !== day);
  current = { ...current, schedule: remaining };

  const tierIndex = buildTierIndex(current);
  const initial: WorldEvent[] = [{ t: 'DayAdvanced', day }];

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
      tier: resolved.tier,
    });
  }

  return dispatch(current, initial, HANDLERS);
}
