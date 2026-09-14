import { describe, it, expect } from 'vitest';
import { createRng, deriveSeed, type Fighter } from '@bm/core-model';
import { generateWorld, WEIGHT_CLASSES } from '@bm/data';
import { resolveFight } from '../src/resolve-fight.js';
import type { SimTier } from '../src/types.js';

/**
 * ІНВАРІАНТ ADR-0015: рівні 2 і 3 зобов'язані відтворювати агрегати рівня 1.
 *
 * Без цього чемпіон, пройдений через фон світу, матиме кар'єру, неможливу на повній
 * симуляції, і світ втратить правдоподібність непомітно для гравця.
 *
 * Параметри наближення виміряні `tools/measure-tiers.ts` із рівня 1. Якщо цей тест
 * упав після зміни рушія бою — інструмент треба перезапустити, а не послабити допуск.
 */
const GROUP_OF: Record<string, string> = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));
const ability = (f: Fighter): number => {
  const v = Object.values(f.attributes);
  return v.reduce((s, x) => s + x, 0) / v.length;
};

const N = 4000;
const TOLERANCE_PP = 3;

interface Aggregate { earlyPct: number; drawPct: number; splitPct: number; strongerWinsPct: number }

function measure(tier: SimTier, group: string, pool: readonly Fighter[], seed: number): Aggregate {
  const rng = createRng(deriveSeed(seed, `equiv/${tier}/${group}`));
  let early = 0, draws = 0, split = 0, decisions = 0, strongerWins = 0, decided = 0;
  for (let i = 0; i < N; i++) {
    const a = pool[rng.int(0, pool.length - 1)] as Fighter;
    let b = pool[rng.int(0, pool.length - 1)] as Fighter;
    if (b.id === a.id) b = pool[(pool.indexOf(a) + 1) % pool.length] as Fighter;
    const r = resolveFight(tier, a, b, 12, rng, group);
    if (r.method === 'KO' || r.method === 'TKO' || r.method === 'RTD') early++;
    else {
      decisions++;
      if (r.method === 'D') draws++;
      if (r.method === 'SD' || r.method === 'MD') split++;
    }
    if (r.winner !== null) {
      decided++;
      const winnerIsA = r.winner === 'a';
      if ((ability(a) >= ability(b)) === winnerIsA) strongerWins++;
    }
  }
  return {
    earlyPct: (early / N) * 100,
    drawPct: (draws / N) * 100,
    splitPct: decisions ? (split / decisions) * 100 : 0,
    strongerWinsPct: decided ? (strongerWins / decided) * 100 : 0,
  };
}

const world = generateWorld(4242, 12000);

describe('рівні 2 і 3 відтворюють агрегати рівня 1 (ADR-0015)', () => {
  for (const group of ['light', 'middle', 'heavy'] as const) {
    const inGroup = world.fighters
      .filter((f) => GROUP_OF[f.constants.naturalWeightClassId] === group)
      .sort((a, b) => ability(b) - ability(a));
    const pool = inGroup.slice(0, Math.max(60, Math.round(inGroup.length * 0.4)));

    const t1 = measure(1, group, pool, 11);
    const t2 = measure(2, group, pool, 11);
    const t3 = measure(3, group, pool, 11);

    it(`${group}: частка дострокових не розходиться більш ніж на ${TOLERANCE_PP} п.п.`, () => {
      expect(Math.abs(t2.earlyPct - t1.earlyPct)).toBeLessThanOrEqual(TOLERANCE_PP);
      expect(Math.abs(t3.earlyPct - t1.earlyPct)).toBeLessThanOrEqual(TOLERANCE_PP);
    });

    it(`${group}: частка нічиїх не розходиться більш ніж на ${TOLERANCE_PP} п.п.`, () => {
      expect(Math.abs(t2.drawPct - t1.drawPct)).toBeLessThanOrEqual(TOLERANCE_PP);
      expect(Math.abs(t3.drawPct - t1.drawPct)).toBeLessThanOrEqual(TOLERANCE_PP);
    });

    it(`${group}: частка роздільних рішень не розходиться більш ніж на ${TOLERANCE_PP + 2} п.п.`, () => {
      expect(Math.abs(t2.splitPct - t1.splitPct)).toBeLessThanOrEqual(TOLERANCE_PP + 2);
      expect(Math.abs(t3.splitPct - t1.splitPct)).toBeLessThanOrEqual(TOLERANCE_PP + 2);
    });

    it(`${group}: сильніший перемагає приблизно так само часто`, () => {
      expect(Math.abs(t2.strongerWinsPct - t1.strongerWinsPct)).toBeLessThanOrEqual(5);
      expect(Math.abs(t3.strongerWinsPct - t1.strongerWinsPct)).toBeLessThanOrEqual(8);
    });
  }
});
