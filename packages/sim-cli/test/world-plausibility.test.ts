import { describe, it, expect } from 'vitest';
import { buildWorld, defaultCardSize, runSeason } from '../src/season.js';

/**
 * Правдоподібність світу на довгому прогоні.
 *
 * Ці перевірки з'явилися після прогону на три роки, який показав, що 83.7% бійців
 * не б'ються жодного разу, а найактивніший проводить 21 бій із проміжком у 7 днів.
 * Причина була в тому, що відновлення після бою нараховувалося лише травмованим,
 * тож переможець був доступний уже наступного тижня.
 */
const YEAR = 365;
const result = runSeason(buildWorld(2026, 800), YEAR * 2);
const world = result.world;
const fighters = Object.values(world.fighters);

const gaps: number[] = [];
for (const entries of Object.values(world.history)) {
  for (let i = 1; i < entries.length; i++) {
    gaps.push((entries[i] as { day: number }).day - (entries[i - 1] as { day: number }).day);
  }
}

describe('світ на довгому прогоні', () => {
  it('переважна більшість бійців справді б\'ється', () => {
    const idle = fighters.filter((f) => (world.history[f.id] ?? []).length === 0).length;
    expect(idle / fighters.length).toBeLessThan(0.10);
  });

  it('темп кар\'єри правдоподібний: 1.5–4 бої на рік', () => {
    const perYear = (result.fightsHeld * 2) / fighters.length / 2;
    expect(perYear).toBeGreaterThan(1.5);
    expect(perYear).toBeLessThan(4);
  });

  it('боксер не виходить у ринг частіше ніж раз на вісім тижнів', () => {
    expect(gaps.length).toBeGreaterThan(100);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(56);
  });

  it('розмір картки масштабується зі світом', () => {
    expect(defaultCardSize(800)).toBeGreaterThan(defaultCardSize(200));
    expect(defaultCardSize(50)).toBeGreaterThanOrEqual(4);
  });

  it('знос лишається в межах і тільки зростає', () => {
    for (const f of fighters) {
      expect(f.wear.headTrauma).toBeGreaterThanOrEqual(0);
      expect(f.wear.headTrauma).toBeLessThanOrEqual(100);
      expect(f.wear.bodyWear).toBeLessThanOrEqual(100);
      expect(Number.isFinite(f.wear.roundsBoxed)).toBe(true);
    }
  });

  it('рекорди лишаються узгодженими', () => {
    for (const f of fighters) {
      expect(f.record.wins).toBeGreaterThanOrEqual(0);
      expect(f.record.losses).toBeGreaterThanOrEqual(0);
      expect(f.record.knockouts).toBeLessThanOrEqual(f.record.wins);
    }
  });

  it('усі рейтингові таблиці заповнюються і бали скінченні', () => {
    const tables = Object.values(world.rankings);
    expect(tables.length).toBeGreaterThan(0);
    const empty = tables.filter((t) => t.length === 0).length;
    expect(empty / tables.length).toBeLessThan(0.15);
    for (const table of tables) {
      for (const row of table) expect(Number.isFinite(row.score)).toBe(true);
    }
  });

  it('частка недоступних правдоподібна, світ не завмирає', () => {
    const unavailable = Object.values(world.unavailableUntil).filter((d) => d > world.day).length;
    const share = unavailable / fighters.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.85);
  });
});
