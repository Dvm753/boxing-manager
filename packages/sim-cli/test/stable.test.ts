import { describe, it, expect } from 'vitest';
import { seekingBonus, MATCHMAKING_TUNING } from '@bm/data';
import { startCareer } from '@bm/session';
import { buildWorld, runSeason } from '../src/season.js';

/**
 * ADR-0024: кілька бійців у стайблі і правило «боєць без пропозицій шукає бій сам».
 * Обидві перевірки з'явилися після вимірювання: з одним бійцем гравець ухвалював
 * 9.2 рішення на рік замість обіцяних 15, а в 3 прогонах із 20 не ухвалював жодного.
 */
const YEAR = 365;
const SEEDS = [2026, 77, 1234];

const withStable = (seed: number, size: number) => {
  const base = buildWorld(seed, 600);
  const ids = Object.keys(base.fighters).sort();
  const picks = [ids[10], ids[300], ids[550]].slice(0, size) as string[];
  let world = base;
  for (const id of picks) world = startCareer(world, id);
  return { world, picks };
};

describe('стайбл із кількох бійців (ADR-0024)', () => {
  it('за трьох підопічних гравець ухвалює 12…40 рішень на ігровий рік', () => {
    for (const seed of SEEDS) {
      const { world } = withStable(seed, 3);
      const { decisionsMade } = runSeason(world, YEAR);
      expect(decisionsMade, `seed ${seed}`).toBeGreaterThanOrEqual(12);
      expect(decisionsMade, `seed ${seed}`).toBeLessThanOrEqual(40);
    }
  });

  it('кожен підопічний за рік хоч раз виходить у ринг або має призначений бій', () => {
    for (const seed of SEEDS) {
      const { world, picks } = withStable(seed, 3);
      const season = runSeason(world, YEAR);
      const forgotten = picks.filter((id) =>
        (season.world.history[id] ?? []).length === 0
        && !season.world.schedule.some((f) => f.aId === id || f.bId === id)
        && !season.world.decisions.some((d) => d.fighterId === id));
      expect(forgotten, `seed ${seed}`).toEqual([]);
    }
  });

  it('світ без гравця теж не лишає бійців забутими: за два роки всі б\'ються', () => {
    const season = runSeason(buildWorld(2026, 800), YEAR * 2);
    const fighters = Object.values(season.world.fighters);
    const idle = fighters.filter((f) => (season.world.history[f.id] ?? []).length === 0);
    expect(idle.length / fighters.length).toBeLessThan(0.02);
  });

  it('темп кар\'єри лишається правдоподібним попри примусові бої', () => {
    const season = runSeason(buildWorld(2026, 800), YEAR * 2);
    const perYear = (season.fightsHeld * 2) / Object.keys(season.world.fighters).length / 2;
    expect(perYear).toBeGreaterThan(1.5);
    expect(perYear).toBeLessThan(4);
  });
});

describe('надбавка «шукає бій сам»', () => {
  it('нуль у нормальному ритмі й зростає з простоєм до стелі', () => {
    const { afterDays, maxBonus } = MATCHMAKING_TUNING.seeking;
    expect(seekingBonus(0)).toBe(0);
    expect(seekingBonus(afterDays - 1)).toBe(0);
    expect(seekingBonus(afterDays)).toBeGreaterThan(0);
    expect(seekingBonus(afterDays + 90)).toBeGreaterThan(seekingBonus(afterDays));
    expect(seekingBonus(afterDays + 3650)).toBe(maxBonus);
  });
});
