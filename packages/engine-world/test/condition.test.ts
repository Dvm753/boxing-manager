import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { CONDITION_TUNING, generateWorld } from '@bm/data';
import { advanceDay, advanceCondition, conditionAfterFight, sharpnessCeiling } from '../src/index.js';
import type { ScheduledFight, World } from '../src/types.js';

const START = 20454;

function worldOf(count: number, seed = 99): World {
  const generated = generateWorld(seed, count);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: START, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [],
  };
}

const run = (world: World, days: number): World => {
  let current = world;
  for (let i = 0; i < days; i++) current = advanceDay(current, [], createRng(1)).world;
  return current;
};

const ids = (world: World): string[] => Object.keys(world.fighters).sort();

describe('динаміка форми (ADR-0022)', () => {
  it('без боїв гострота падає — ринг-руст існує', () => {
    const world = worldOf(20);
    const [id] = ids(world);
    const before = (world.fighters[id as string] as Fighter).condition.sharpness;
    const after = (run(world, 365).fighters[id as string] as Fighter).condition.sharpness;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(CONDITION_TUNING.sharpness.floor);
  });

  it('після трьох років простою боєць у гіршій формі, ніж той, що вийшов із табору', () => {
    const base = worldOf(20);
    const [rusty, camper] = ids(base);
    // Табір: бій призначено рівно на кінець вікна табору.
    const fight: ScheduledFight = {
      id: 'camp-1', day: START + CONDITION_TUNING.sharpness.campWindowDays,
      aId: camper as string, bId: ids(base)[2] as string, scheduledRounds: 12,
    };
    const idle = run(base, 365 * 3);
    const trained = run({ ...base, schedule: [fight] }, CONDITION_TUNING.sharpness.campWindowDays - 1);

    const rustySharp = (idle.fighters[rusty as string] as Fighter).condition.sharpness;
    const campSharp = (trained.fighters[camper as string] as Fighter).condition.sharpness;
    expect(campSharp).toBeGreaterThan(rustySharp);
  });

  it('табір відкривається подією рівно за вікно до бою', () => {
    const base = worldOf(20);
    const [a, b] = ids(base);
    const window = CONDITION_TUNING.sharpness.campWindowDays;
    const world: World = {
      ...base,
      schedule: [{ id: 'f1', day: START + window + 1, aId: a as string, bId: b as string, scheduledRounds: 12 }],
    };
    const { events } = advanceDay(world, [], createRng(1));
    const camps = events.filter((e) => e.t === 'FighterCampStarted');
    expect(camps).toHaveLength(2);
    expect(camps.map((e) => (e as { fighterId: string }).fighterId).sort()).toEqual([a, b].sort());
  });

  it('свіжість падає після бою пропорційно раундам і шкоді', () => {
    const world = worldOf(4);
    const fighter = world.fighters[ids(world)[0] as string] as Fighter;
    const short = conditionAfterFight(fighter, 4, 1);
    const long = conditionAfterFight(fighter, 12, 3);
    expect(long.freshness).toBeLessThan(short.freshness);
    expect(short.freshness).toBeLessThan(fighter.condition.freshness);
  });

  it('боєць, що вийшов раніше кінця відновлення, свіжий менше', () => {
    const base = worldOf(20);
    const [a, b] = ids(base);
    const fought: World = {
      ...base,
      schedule: [{ id: 'f1', day: START + 1, aId: a as string, bId: b as string, scheduledRounds: 12 }],
    };
    const afterFight = run(fought, 1);
    const early = run(afterFight, 30);
    const late = run(afterFight, 90);
    const fresh = (w: World): number => (w.fighters[a as string] as Fighter).condition.freshness;
    expect(fresh(afterFight)).toBeLessThan(fresh(early));
    expect(fresh(early)).toBeLessThan(fresh(late));
  });

  it('бій гострить бійця, але не вище його стелі', () => {
    const world = worldOf(4);
    const fighter = world.fighters[ids(world)[0] as string] as Fighter;
    const sharp = conditionAfterFight(fighter, 10, 2).sharpness;
    expect(sharp).toBeGreaterThanOrEqual(fighter.condition.sharpness);
    expect(sharp).toBeLessThanOrEqual(sharpnessCeiling(fighter));
  });

  it('стеля гостроти залежить від працьовитості й професіоналізму', () => {
    const world = worldOf(60);
    const fighters = Object.values(world.fighters);
    const lazy = [...fighters].sort((x, y) =>
      (x.attributes.workRate + x.attributes.professionalism) - (y.attributes.workRate + y.attributes.professionalism))[0] as Fighter;
    const keen = [...fighters].sort((x, y) =>
      (y.attributes.workRate + y.attributes.professionalism) - (x.attributes.workRate + x.attributes.professionalism))[0] as Fighter;
    expect(sharpnessCeiling(keen)).toBeGreaterThan(sharpnessCeiling(lazy));
  });

  it('форма ніколи не виходить за 0…100 на довгому прогоні', () => {
    const world = run(worldOf(40), 400);
    for (const f of Object.values(world.fighters)) {
      expect(f.condition.sharpness).toBeGreaterThanOrEqual(0);
      expect(f.condition.sharpness).toBeLessThanOrEqual(100);
      expect(f.condition.freshness).toBeGreaterThanOrEqual(0);
      expect(f.condition.freshness).toBeLessThanOrEqual(100);
    }
  });

  it('перерахунок не бере випадковості: той самий світ дає ті самі зміни', () => {
    const world = worldOf(30);
    expect(advanceCondition(world, START + 1)).toEqual(advanceCondition(world, START + 1));
  });

  it('зміни впорядковані за id, а не порядком у мапі бійців', () => {
    const { changes } = advanceCondition(worldOf(30), START + 1);
    const sorted = [...changes].map((c) => c.fighterId).sort();
    expect(changes.map((c) => c.fighterId)).toEqual(sorted);
  });

  it('боєць у рівновазі не потрапляє у зміни — світ не копіюється дарма', () => {
    const settled = run(worldOf(20), 420);
    const { changes } = advanceCondition(settled, settled.day + 1);
    expect(changes.length).toBeLessThan(Object.keys(settled.fighters).length);
  });
});
