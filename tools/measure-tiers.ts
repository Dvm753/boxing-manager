/**
 * Вимірює параметри наближення рівнів 2 і 3 з ПОВНОЇ симуляції рівня 1 (інваріант ADR-0015).
 * Записує `packages/data/src/reference/tier-approximation.json`.
 *
 * Числа тут не вигадані й не підібрані вручну: вони є результатом прогону рівня 1.
 * Перезапускати після будь-якої зміни рушія бою або коефіцієнтів.
 */
import { writeFileSync } from 'node:fs';
import { createRng, deriveSeed, type Fighter } from '../packages/core-model/src/index.js';
import { generateWorld, WEIGHT_CLASSES } from '../packages/data/src/index.js';
import { simulateFight, EMPTY_PLAN, type FightContext, type JudgeProfile } from '../packages/engine-fight/src/index.js';

const N = Number(process.argv[2] ?? 6000);
const ROUNDS = 12;
const GROUP_OF = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w.group]));
const ability = (f: Fighter): number => {
  const v = Object.values(f.attributes);
  return v.reduce((s, x) => s + x, 0) / v.length;
};
const snap = (f: Fighter) => ({
  id: f.id, attributes: f.attributes, styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm, reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness, freshness: f.condition.freshness, headTrauma: f.wear.headTrauma,
});
const judges = (rng: ReturnType<typeof createRng>): FightContext['judges'] => {
  const one = (id: string): JudgeProfile => ({
    id, cleanPunching: 0.9 + rng.next() * 0.8, aggression: 0.5 + rng.next() * 0.9,
    ringGeneralship: 0.5 + rng.next() * 0.8, defence: 0.3 + rng.next() * 0.7, bias: (rng.next() - 0.5) * 0.5,
  });
  return [one('j1'), one('j2'), one('j3')];
};

/** Однопараметрична логістична підгонка градієнтним підйомом. Детермінована. */
function fitSlope(samples: readonly { gap: number; aWon: boolean }[]): number {
  let slope = 0.3;
  for (let step = 0; step < 400; step++) {
    let grad = 0;
    for (const s of samples) {
      const p = 1 / (1 + Math.exp(-s.gap * slope));
      grad += ((s.aWon ? 1 : 0) - p) * s.gap;
    }
    slope += (grad / samples.length) * 0.5;
  }
  return Number(slope.toFixed(4));
}

const out: Record<string, unknown> = {
  _note: 'Виміряно з повної симуляції рівня 1 інструментом tools/measure-tiers.ts. Не редагувати вручну.',
};

const world = generateWorld(2026, 12000);
for (const group of ['light', 'middle', 'heavy'] as const) {
  const inGroup = world.fighters.filter((f) => GROUP_OF[f.constants.naturalWeightClassId] === group)
    .sort((a, b) => ability(b) - ability(a));
  const pool = inGroup.slice(0, Math.max(60, Math.round(inGroup.length * 0.4)));
  const rng = createRng(deriveSeed(2026, `measure/${group}`));

  let early = 0, ko = 0, draws = 0, split = 0, decisions = 0;
  const hist = new Array<number>(ROUNDS).fill(0);
  const samples: { gap: number; aWon: boolean }[] = [];

  for (let i = 0; i < N; i++) {
    const a = pool[rng.int(0, pool.length - 1)] as Fighter;
    let b = pool[rng.int(0, pool.length - 1)] as Fighter;
    if (b.id === a.id) b = pool[(pool.indexOf(a) + 1) % pool.length] as Fighter;
    const ctx: FightContext = {
      scheduledRounds: ROUNDS, judges: judges(rng), planA: EMPTY_PLAN, planB: EMPTY_PLAN, threeKnockdownRule: false,
    };
    const { result } = simulateFight(snap(a), snap(b), ctx, rng);
    if (result.winner) samples.push({ gap: ability(a) - ability(b), aWon: result.winner === 'a' });

    if (result.method === 'KO' || result.method === 'TKO' || result.method === 'RTD') {
      early++;
      if (result.method === 'KO') ko++;
      hist[result.endingRound - 1] = (hist[result.endingRound - 1] as number) + 1;
    } else {
      decisions++;
      if (result.method === 'D') draws++;
      if (result.method === 'SD' || result.method === 'MD') split++;
    }
  }

  out[group] = {
    earlyPct: Number(((early / N) * 100).toFixed(2)),
    koShare: Number((ko / Math.max(1, early)).toFixed(4)),
    roundHistogram: hist.map((c) => Number((c / Math.max(1, early)).toFixed(5))),
    drawPct: Number(((draws / N) * 100).toFixed(2)),
    splitPct: Number(((split / Math.max(1, decisions)) * 100).toFixed(2)),
    abilitySlope: fitSlope(samples),
    measuredFrom: { fights: N, seed: 2026, rounds: ROUNDS },
  };
  console.log(`${group}: дострокові ${(early / N * 100).toFixed(1)}%  нічиї ${(draws / N * 100).toFixed(2)}%  ` +
    `роздільні ${(split / decisions * 100).toFixed(1)}%  нахил ${(out[group] as { abilitySlope: number }).abilitySlope}`);
}

writeFileSync('packages/data/src/reference/tier-approximation.json', JSON.stringify(out, null, 2) + '\n');
console.log('\n✓ packages/data/src/reference/tier-approximation.json');
