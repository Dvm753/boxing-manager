/**
 * Масові прогони під гейт фази 0 (ADR-0009). Рахує M1, M3, M4 з довірчими інтервалами
 * і звіряє з коридорами ADR-0008.
 */
import { createRng, deriveSeed, type Rng } from '@bm/core-model';
import { generateWorld, WEIGHT_CLASSES } from '@bm/data';
import { simulateFight, EMPTY_PLAN, type FightContext, type FighterSnapshot, type JudgeProfile } from '@bm/engine-fight';
import type { Fighter } from '@bm/core-model';

export interface GroupReport {
  group: string;
  n: number;
  earlyPct: number; earlyCi: number;
  drawPct: number; drawCi: number;
  splitPct: number; splitCi: number; decisions: number;
  avgRounds: number;
  koPct: number; tkoPct: number;
  punchesPerRound: number;
}

const ci95 = (k: number, n: number): number => {
  if (n === 0) return NaN;
  const p = k / n;
  return 1.96 * Math.sqrt((p * (1 - p)) / n) * 100;
};

export const toSnapshot = (f: Fighter): FighterSnapshot => ({
  id: f.id,
  attributes: f.attributes,
  styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm,
  reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness,
  freshness: f.condition.freshness,
  headTrauma: f.wear.headTrauma,
});

export function makeJudges(rng: Rng): FightContext['judges'] {
  const one = (id: string): JudgeProfile => ({
    id,
    cleanPunching: 0.9 + rng.next() * 0.8,
    aggression: 0.5 + rng.next() * 0.9,
    ringGeneralship: 0.5 + rng.next() * 0.8,
    defence: 0.3 + rng.next() * 0.7,
    bias: (rng.next() - 0.5) * 0.5,
  });
  return [one('j1'), one('j2'), one('j3')];
}

const GROUP_OF: Record<string, string> = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));

/** Пари підбираються всередині схожого рівня — це аналог титульних боїв (страта C). */
export function runCalibration(seed: number, fightsPerGroup: number): GroupReport[] {
  // Великий світ: пул кожної групи має бути достатнім, щоб його склад не «плавав» від seed до seed.
  const world = generateWorld(seed, 12000);
  const avg = (f: Fighter): number => {
    const v = Object.values(f.attributes);
    return v.reduce((s, x) => s + x, 0) / v.length;
  };

  const reports: GroupReport[] = [];
  for (const group of ['light', 'middle', 'heavy'] as const) {
    // Пропорційний зріз, а не фіксоване число: групи мають різну кількість вагових категорій,
    // тож фіксоване «топ-800» дало б для легкої ваги еліту, а для важкої — майже всю групу.
    const inGroup = world.fighters
      .filter((f) => GROUP_OF[f.constants.naturalWeightClassId] === group)
      .sort((x, y) => avg(y) - avg(x));
    const pool = inGroup.slice(0, Math.max(60, Math.round(inGroup.length * 0.4)));

    const rng = createRng(deriveSeed(seed, `calibrate/${group}`));
    let early = 0, ko = 0, tko = 0, draws = 0, split = 0, decisions = 0, rounds = 0;
    let thrown = 0, roundsBoxed = 0;

    for (let i = 0; i < fightsPerGroup; i++) {
      const ai = rng.int(0, pool.length - 1);
      let bi = rng.int(0, pool.length - 1);
      if (bi === ai) bi = (bi + 1) % pool.length;
      const context: FightContext = {
        scheduledRounds: 12,
        judges: makeJudges(rng),
        planA: EMPTY_PLAN,
        planB: EMPTY_PLAN,
        threeKnockdownRule: false,
      };
      const { result } = simulateFight(
        toSnapshot(pool[ai] as Fighter), toSnapshot(pool[bi] as Fighter), context, rng,
      );
      rounds += result.endingRound;
      roundsBoxed += result.endingRound;
      thrown += result.statsA.thrown + result.statsB.thrown;

      if (result.method === 'KO' || result.method === 'TKO' || result.method === 'RTD') {
        early++;
        if (result.method === 'KO') ko++; else tko++;
      } else {
        decisions++;
        if (result.method === 'D') draws++;
        if (result.method === 'SD' || result.method === 'MD') split++;
      }
    }

    const n = fightsPerGroup;
    reports.push({
      group, n,
      earlyPct: (early / n) * 100, earlyCi: ci95(early, n),
      drawPct: (draws / n) * 100, drawCi: ci95(draws, n),
      splitPct: decisions ? (split / decisions) * 100 : NaN, splitCi: ci95(split, decisions), decisions,
      avgRounds: rounds / n,
      koPct: (ko / n) * 100, tkoPct: (tko / n) * 100,
      punchesPerRound: thrown / roundsBoxed / 2,
    });
  }
  return reports;
}
