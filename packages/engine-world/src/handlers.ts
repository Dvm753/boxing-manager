import type { EventHandler, HandlerResult } from './event-bus.js';
import type { FightRecordEntry, World, WorldEvent } from './types.js';

const unchanged = (world: World): HandlerResult => ({ world });

/**
 * Кожен обробник змінює **лише власний агрегат** (ADR-0016 §5) і публікує похідні події.
 * Порядок у масиві `HANDLERS` є частиною контракту: від нього залежить детермінізм.
 */

/** Рекорд і історія боїв. */
const recordHandler: EventHandler = (event, world) => {
  if (event.t !== 'FightCompleted') return unchanged(world);

  const entryFor = (self: string, other: string): FightRecordEntry => ({
    fightId: event.fightId,
    day: event.day,
    opponentId: other,
    method: event.method,
    won: event.winnerId === null ? null : event.winnerId === self,
    endingRound: event.endingRound,
    tier: event.tier,
  });

  const fighters = { ...world.fighters };
  const history = { ...world.history };
  const isKo = event.method === 'KO' || event.method === 'TKO' || event.method === 'RTD';

  for (const [self, other] of [[event.aId, event.bId], [event.bId, event.aId]] as const) {
    const fighter = fighters[self];
    if (!fighter) continue;
    const won = event.winnerId === null ? null : event.winnerId === self;
    fighters[self] = {
      ...fighter,
      record: {
        wins: fighter.record.wins + (won === true ? 1 : 0),
        losses: fighter.record.losses + (won === false ? 1 : 0),
        draws: fighter.record.draws + (won === null ? 1 : 0),
        knockouts: fighter.record.knockouts + (won === true && isKo ? 1 : 0),
      },
    };
    history[self] = [...(history[self] ?? []), entryFor(self, other)];
  }

  return {
    world: { ...world, fighters, history },
    emit: [
      { t: 'FighterRecordUpdated', fighterId: event.aId, day: event.day },
      { t: 'FighterRecordUpdated', fighterId: event.bId, day: event.day },
      {
        t: 'FighterWearIncreased', fighterId: event.aId,
        rounds: event.endingRound, headDelta: event.winnerId === event.aId ? 1 : 3,
      },
      {
        t: 'FighterWearIncreased', fighterId: event.bId,
        rounds: event.endingRound, headDelta: event.winnerId === event.bId ? 1 : 3,
      },
      {
        t: 'NewsCreated',
        key: event.winnerId === null ? 'news.fightDrawn' : 'news.fightWon',
        params: {
          winner: event.winnerId ?? '',
          loser: event.winnerId === event.aId ? event.bId : event.aId,
          method: event.method,
          round: event.endingRound,
        },
      },
    ],
  };
};

/** Знос: тільки вгору, незворотно (DOMAIN_MODEL). */
const wearHandler: EventHandler = (event, world) => {
  if (event.t !== 'FighterWearIncreased') return unchanged(world);
  const fighter = world.fighters[event.fighterId];
  if (!fighter) return unchanged(world);

  const headTrauma = Math.min(100, fighter.wear.headTrauma + event.headDelta);
  const emit: WorldEvent[] = [];
  // Важкий бій виводить бійця з ладу; довжина паузи росте зі зносом.
  if (event.headDelta >= 3 && event.rounds >= 8) {
    emit.push({ t: 'FighterInjured', fighterId: event.fighterId, daysOut: 45 + Math.round(headTrauma * 0.8) });
  }

  return {
    world: {
      ...world,
      fighters: {
        ...world.fighters,
        [event.fighterId]: {
          ...fighter,
          wear: {
            headTrauma,
            bodyWear: Math.min(100, fighter.wear.bodyWear + Math.round(event.rounds * 0.4)),
            roundsBoxed: fighter.wear.roundsBoxed + event.rounds,
          },
        },
      },
    },
    emit,
  };
};

/** Доступність бійця. */
const availabilityHandler: EventHandler = (event, world) => {
  if (event.t !== 'FighterInjured') return unchanged(world);
  return {
    world: {
      ...world,
      unavailableUntil: { ...world.unavailableUntil, [event.fighterId]: world.day + event.daysOut },
    },
  };
};

/** Стрічка новин. Зберігає ключ і параметри, не готовий рядок (ADR-0017). */
const newsHandler: EventHandler = (event, world) => {
  if (event.t !== 'NewsCreated') return unchanged(world);
  return {
    world: { ...world, news: [...world.news, { day: world.day, key: event.key, params: event.params }] },
  };
};

export const HANDLERS: readonly EventHandler[] = [
  recordHandler, wearHandler, availabilityHandler, newsHandler,
];
