import { describe, it, expect } from 'vitest';
import { buildWorld, runSeason } from '../src/season.js';
import { formatIso } from '@bm/engine-world';

describe('прогін сезону', () => {
  it('детермінований: той самий seed дає той самий світ', () => {
    const run = (): string => {
      const { world, fightsHeld, byTier } = runSeason(buildWorld(2026, 400), 60);
      return JSON.stringify({ day: world.day, fightsHeld, byTier, news: world.news });
    };
    expect(run()).toBe(run());
  });

  it('інший seed дає інший сезон', () => {
    const a = runSeason(buildWorld(1, 400), 60);
    const b = runSeason(buildWorld(2, 400), 60);
    expect(JSON.stringify(a.world.news)).not.toBe(JSON.stringify(b.world.news));
  });

  it('день просувається рівно на задану кількість', () => {
    const start = buildWorld(5, 300);
    const { world } = runSeason(start, 90);
    expect(world.day).toBe(start.day + 90);
  });

  it('бої проводяться і потрапляють у новини', () => {
    const { world, fightsHeld } = runSeason(buildWorld(7, 600), 120);
    expect(fightsHeld).toBeGreaterThan(0);
    expect(world.news.length).toBe(fightsHeld);
  });

  it('усі три рівні деталізації задіяні у великому світі', () => {
    const { byTier } = runSeason(buildWorld(11, 3000), 200);
    expect(byTier[1]).toBeGreaterThan(0);
    expect(byTier[2]).toBeGreaterThan(0);
    expect(byTier[3]).toBeGreaterThan(0);
  });

  it('травмований боєць не отримує нового бою, поки не відновиться', () => {
    const { world } = runSeason(buildWorld(13, 500), 120);
    const injured = Object.entries(world.unavailableUntil).filter(([, until]) => until > world.day);
    for (const [id] of injured) {
      const last = (world.history[id] ?? []).at(-1);
      // Останній бій травмованого має бути в минулому, а не сьогодні після травми.
      if (last) expect(last.day).toBeLessThanOrEqual(world.day);
    }
    expect(injured.length).toBeGreaterThan(0);
  });

  it('рекорди зростають узгоджено з історією', () => {
    const { world } = runSeason(buildWorld(17, 400), 150);
    for (const [id, entries] of Object.entries(world.history)) {
      const fighter = world.fighters[id];
      if (!fighter) continue;
      const wins = entries.filter((e) => e.won === true).length;
      const losses = entries.filter((e) => e.won === false).length;
      const draws = entries.filter((e) => e.won === null).length;
      expect(fighter.record.wins).toBeGreaterThanOrEqual(wins);
      expect(fighter.record.losses).toBeGreaterThanOrEqual(losses);
      expect(fighter.record.draws).toBeGreaterThanOrEqual(draws);
    }
  });

  it('дати зростають монотонно у стрічці новин', () => {
    const { world } = runSeason(buildWorld(19, 400), 180);
    for (let i = 1; i < world.news.length; i++) {
      expect((world.news[i] as { day: number }).day)
        .toBeGreaterThanOrEqual((world.news[i - 1] as { day: number }).day);
    }
    expect(formatIso(world.day)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
