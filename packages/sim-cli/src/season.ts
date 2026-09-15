import { createRng, deriveSeed, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import { advanceDay, rankingKey, type PlayerCommand, type World } from '@bm/engine-world';
import { makeCandidate, proposeCard, type MatchCandidate } from '@bm/ai';
import { SANCTIONING_BODIES } from '@bm/data';

/**
 * Прогін сезону. Пари підбирає **пакет `ai`** тим самим розрахунком, яким користуватиметься
 * гравець — бій виникає лише тоді, коли його хочуть обидві сторони.
 */
export interface SeasonResult {
  world: World;
  fightsHeld: number;
  byTier: Record<number, number>;
}

export function buildWorld(seed: number, fighterCount: number, startDay = 20454): World {
  const generated = generateWorld(seed, fighterCount);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: startDay, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
  };
}

/**
 * Розмір тижневої картки за замовчуванням масштабується зі світом: фіксоване число
 * означало б, що у світі з 2000 бійців кожен виходить у ринг раз на шість років.
 * Орієнтир — 2.5 бої на бійця на рік, тобто ~`n × 2.5 / 52 / 2` пар на тиждень.
 */
export const defaultCardSize = (fighterCount: number): number =>
  Math.max(4, Math.round((fighterCount * 2.5) / 52 / 2));

export function runSeason(world: World, days: number, fightsPerCard?: number): SeasonResult {
  const cardSize = fightsPerCard ?? defaultCardSize(Object.keys(world.fighters).length);
  let current = world;
  let fightsHeld = 0;
  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const rng = createRng(deriveSeed(world.seed, 'season'));

  for (let d = 0; d < days; d++) {
    const commands: PlayerCommand[] = [];

    // Картка раз на тиждень: бокс не проводить бої щодня для тих самих людей.
    if (d % 7 === 0) {
      const lastFightDay = new Map<string, number>();
      for (const [fighterId, entries] of Object.entries(current.history)) {
        const last = entries.at(-1);
        if (last) lastFightDay.set(fighterId, last.day);
      }

      // Позиції в таблицях беремо через індекс, а не пошуком по кожному бійцю.
      const positionOf = new Map<string, number>();
      for (const [key, table] of Object.entries(current.rankings)) {
        for (const row of table) positionOf.set(`${key}|${row.fighterId}`, row.position);
      }

      const candidates: MatchCandidate[] = Object.values(current.fighters).map((fighter) => makeCandidate(
        fighter,
        SANCTIONING_BODIES.map((body) => ({
          bodyId: body.id,
          position: positionOf.get(
            `${rankingKey(body.id, fighter.constants.naturalWeightClassId)}|${fighter.id}`,
          ) ?? null,
        })),
        lastFightDay.get(fighter.id) ?? null,
        (current.unavailableUntil[fighter.id] ?? 0) <= current.day,
      ));

      const card = proposeCard(candidates, { day: current.day, rng }, { targetBouts: cardSize });
      card.forEach((bout, i) => {
        commands.push({
          t: 'scheduleFight',
          fight: {
            id: `d${current.day + 1}-${i}-${bout.aId.slice(0, 8)}`,
            day: current.day + 1,
            aId: bout.aId, bId: bout.bId,
            scheduledRounds: 12,
          },
        });
      });
    }

    const { world: next, events } = advanceDay(current, commands, rng);
    for (const event of events) {
      if (event.t === 'FightCompleted') {
        fightsHeld++;
        byTier[event.tier] = (byTier[event.tier] ?? 0) + 1;
      }
    }
    current = next;
  }

  return { world: current, fightsHeld, byTier };
}
