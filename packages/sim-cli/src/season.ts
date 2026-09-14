import { createRng, deriveSeed, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import { advanceDay, type PlayerCommand, type World } from '@bm/engine-world';

/**
 * Найпростіший матчмейкінг для прогону сезону: пари підбираються всередині вагової категорії
 * серед доступних бійців. Це **інструмент прогону**, а не система гри — справжній матчмейкінг
 * із ризиком, гаманцем і політикою рейтингів належить фазі 2 (`ROADMAP.md`).
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

export function runSeason(world: World, days: number, fightsPerCard = 6): SeasonResult {
  let current = world;
  let fightsHeld = 0;
  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const rng = createRng(deriveSeed(world.seed, 'season'));

  for (let d = 0; d < days; d++) {
    const commands: PlayerCommand[] = [];

    // Картка раз на тиждень: бокс не проводить бої щодня для тих самих людей.
    if (d % 7 === 0) {
      const byClass = new Map<string, Fighter[]>();
      for (const fighter of Object.values(current.fighters)) {
        if ((current.unavailableUntil[fighter.id] ?? 0) > current.day) continue;
        const key = fighter.constants.naturalWeightClassId;
        const list = byClass.get(key);
        if (list) list.push(fighter); else byClass.set(key, [fighter]);
      }
      const classes = [...byClass.keys()].sort();
      for (let i = 0; i < fightsPerCard && classes.length > 0; i++) {
        const pool = byClass.get(classes[rng.int(0, classes.length - 1)] as string) as Fighter[];
        if (!pool || pool.length < 2) continue;
        const ai = rng.int(0, pool.length - 1);
        let bi = rng.int(0, pool.length - 1);
        if (bi === ai) bi = (bi + 1) % pool.length;
        const a = pool[ai] as Fighter;
        const b = pool[bi] as Fighter;
        if (a.id === b.id) continue;
        commands.push({
          t: 'scheduleFight',
          fight: {
            id: `d${current.day + 1}-${i}-${a.id.slice(0, 8)}`,
            day: current.day + 1,
            aId: a.id, bId: b.id,
            scheduledRounds: 12,
          },
        });
      }
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
