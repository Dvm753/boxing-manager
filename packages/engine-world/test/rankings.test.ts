import { describe, it, expect } from 'vitest';
import { SANCTIONING_BODIES, bodyById } from '@bm/data';
import { buildWorld, runSeason } from '@bm/sim-cli';
import {
  computeScores, publishRankings, rankWeightClass, rankingKey, RANKING_SIZE, ITERATIONS,
} from '../src/rankings.js';
import type { World } from '../src/types.js';

/** Світ із реальною історією боїв: рейтинг без історії не має що ранжувати. */
const seasoned: World = runSeason(buildWorld(2026, 2500), 500).world;

const topIds = (world: World, bodyId: string, weightClassId: string): string[] => {
  const scores = computeScores(world, bodyById(bodyId));
  return rankWeightClass(world, bodyById(bodyId), weightClassId, scores).map((r) => r.fighterId);
};

const busiestClass = (): string => {
  const counts = new Map<string, number>();
  for (const id of Object.keys(seasoned.history)) {
    const f = seasoned.fighters[id];
    if (!f) continue;
    const key = f.constants.naturalWeightClassId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as string;
};
const busy = busiestClass();

describe('рейтинги як похідна від історії (ADR-0018)', () => {
  it('перерахунок двічі з тієї самої історії дає ідентичний результат', () => {
    expect(JSON.stringify(publishRankings(seasoned))).toBe(JSON.stringify(publishRankings(seasoned)));
  });

  it('ітерації збігаються: додатковий прохід змінює порядок менш ніж на 1%', () => {
    let changed = 0;
    let total = 0;
    for (const body of SANCTIONING_BODIES) {
      const a = rankWeightClass(seasoned, body, busy, computeScores(seasoned, body, ITERATIONS));
      const b = rankWeightClass(seasoned, body, busy, computeScores(seasoned, body, ITERATIONS + 1));
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        total++;
        if (a[i]?.fighterId !== b[i]?.fighterId) changed++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(changed / total).toBeLessThan(0.01);
  });

  it('чотири органи дають РІЗНІ топ-15 з однієї історії — інакше вони декорація', () => {
    const tops = SANCTIONING_BODIES.map((b) => topIds(seasoned, b.id, busy).join(','));
    expect(new Set(tops).size).toBeGreaterThan(1);
    expect(topIds(seasoned, 'sbf', busy).join(',')).not.toBe(topIds(seasoned, 'ipb', busy).join(','));
  });

  it('розбіжність органів змістовна, а не косметична', () => {
    // Склад топ-15 у боксі справді схожий між органами — розходяться вони в ПОРЯДКУ.
    // Саме порядок породжує обов'язкових претендентів і конфлікти, тож він і перевіряється.
    const classes = new Set(Object.values(seasoned.fighters).map((f) => f.constants.naturalWeightClassId));
    const byBody = new Map<string, Map<string, string[]>>();
    for (const body of SANCTIONING_BODIES) {
      const scores = computeScores(seasoned, body);
      const perClass = new Map<string, string[]>();
      for (const weightClass of classes) {
        perClass.set(weightClass, rankWeightClass(seasoned, body, weightClass, scores).map((r) => r.fighterId));
      }
      byBody.set(body.id, perClass);
    }

    let samePosition = 0;
    let totalPositions = 0;
    for (const weightClass of classes) {
      const lists = SANCTIONING_BODIES.map((b) => byBody.get(b.id)?.get(weightClass) ?? []);
      for (let i = 0; i < lists.length; i++) {
        for (let j = i + 1; j < lists.length; j++) {
          const a = lists[i] as string[];
          const b = lists[j] as string[];
          const length = Math.max(a.length, b.length);
          totalPositions += length;
          for (let k = 0; k < length; k++) if (a[k] === b[k]) samePosition++;
        }
      }
    }
    expect(totalPositions).toBeGreaterThan(100);
    const agreement = samePosition / totalPositions;
    // Менш ніж 80% збігів позицій: органи справді сперечаються про порядок.
    expect(agreement).toBeLessThan(0.8);
    // Але й не хаос: якась спільна реальність має бути.
    expect(agreement).toBeGreaterThan(0.15);
  });

  it('таблиця не довша за 15 і позиції йдуть підряд від 1', () => {
    for (const body of SANCTIONING_BODIES) {
      const table = rankWeightClass(seasoned, body, busy, computeScores(seasoned, body));
      expect(table.length).toBeLessThanOrEqual(RANKING_SIZE);
      table.forEach((row, i) => expect(row.position).toBe(i + 1));
    }
  });

  it('бал спадає з позицією', () => {
    const body = bodyById('gbc');
    const table = rankWeightClass(seasoned, body, busy, computeScores(seasoned, body));
    for (let i = 1; i < table.length; i++) {
      expect((table[i] as { score: number }).score)
        .toBeLessThanOrEqual((table[i - 1] as { score: number }).score);
    }
  });

  it('боєць без боїв 18 місяців випадає з топ-15 без окремого правила', () => {
    const body = bodyById('sbf');
    const ranked = topIds(seasoned, body.id, busy);
    expect(ranked.length).toBeGreaterThan(0);

    // Переносимо світ на два роки вперед без жодного бою.
    const frozen: World = { ...seasoned, day: seasoned.day + 550 };
    const after = topIds(frozen, body.id, busy);
    expect(after.length).toBe(0);
  });

  it('свіжа перемога важить більше за таку саму торішню', () => {
    const body = bodyById('uba');
    const now = computeScores(seasoned, body);
    const later = computeScores({ ...seasoned, day: seasoned.day + 365 }, body);
    const anyId = [...now.keys()][0] as string;
    expect(later.get(anyId) ?? 0).toBeLessThan(now.get(anyId) ?? 0);
  });

  it('публікація покриває всі органи й усі вагові категорії світу', () => {
    const published = publishRankings(seasoned);
    const classes = new Set(Object.values(seasoned.fighters).map((f) => f.constants.naturalWeightClassId));
    for (const body of SANCTIONING_BODIES) {
      for (const weightClass of classes) {
        expect(published).toHaveProperty(rankingKey(body.id, weightClass));
      }
    }
  });
});
