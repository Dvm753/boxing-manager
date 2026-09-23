import { STYLE_AXES, type Fighter, type Rng, type StyleAxes } from '@bm/core-model';
import {
  simulateFight, EMPTY_PLAN, type FightContext, type FightEvent, type FightMethod, type FightPlan,
  type FighterSnapshot, type JudgeProfile,
} from '@bm/engine-fight';
import {
  FIGHT_PLAN_AXES, TIER_APPROXIMATION, type FightPlanId, type TierApproximation,
} from '@bm/data';
import { averageAbility } from './tiers.js';
import type { SimTier } from './types.js';

export interface ResolvedFight {
  method: FightMethod;
  /** null — нічия */
  winner: 'a' | 'b' | null;
  endingRound: number;
  tier: SimTier;
  /**
   * Лог бою — лише для рівня 1, єдиного, що його має. Світ його не зберігає (це Q25);
   * `advanceDay` віддає лог титульних боїв назовні, щоб подання могло розповісти бій.
   */
  eventLog?: readonly FightEvent[];
}

const toSnapshot = (f: Fighter): FighterSnapshot => ({
  id: f.id,
  attributes: f.attributes,
  styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm,
  reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness,
  freshness: f.condition.freshness,
  headTrauma: f.wear.headTrauma,
});

function makeJudges(rng: Rng): FightContext['judges'] {
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

/**
 * План на бій (ADR-0014, ADR-0023) — **зсув до власних oсей бійця**, а не нові осі.
 * Тому аутбоксер із планом «тиск» лишається аутбоксером, який тисне сильніше, ніж зазвичай.
 */
export function planFor(fighter: Fighter, plan: FightPlanId | undefined): FightPlan {
  if (plan === undefined || plan === 'balanced') return EMPTY_PLAN;
  const deltas = FIGHT_PLAN_AXES[plan];
  const baseAxes: Partial<StyleAxes> = {};
  for (const axis of STYLE_AXES) {
    const delta = deltas[axis];
    if (delta === undefined) continue;
    baseAxes[axis] = Math.max(1, Math.min(20, fighter.styleAxes[axis] + delta));
  }
  return { baseAxes, blocks: [] };
}

/** Повна симуляція: єдиний рівень, що дає `EventLog`. */
function resolveTier1(
  a: Fighter, b: Fighter, rounds: number, rng: Rng, plans: FightPlans,
): ResolvedFight {
  const context: FightContext = {
    scheduledRounds: rounds,
    judges: makeJudges(rng),
    planA: planFor(a, plans.a),
    planB: planFor(b, plans.b),
    threeKnockdownRule: false,
  };
  const { result, eventLog } = simulateFight(toSnapshot(a), toSnapshot(b), context, rng);
  return { method: result.method, winner: result.winner, endingRound: result.endingRound, tier: 1, eventLog };
}

const pickFromHistogram = (histogram: readonly number[], rng: Rng): number => {
  const roll = rng.next();
  let acc = 0;
  for (let i = 0; i < histogram.length; i++) {
    acc += histogram[i] as number;
    if (roll < acc) return i + 1;
  }
  return histogram.length;
};

/**
 * Рівні 2 і 3 — **калібровані наближення**, а не окрема гра.
 * Параметри виміряні з рівня 1 і лежать у `packages/data`; golden-тест перевіряє,
 * що наближення не розійшлося з повною симуляцією (інваріант ADR-0015).
 *
 * Різниця між рівнями 2 і 3 — у деталізації переможця, а не в розподілах:
 * рівень 2 враховує різницю в майстерності точніше, рівень 3 грубіше.
 */
function resolveApproximate(
  a: Fighter, b: Fighter, rounds: number, rng: Rng, tier: 2 | 3, params: TierApproximation,
): ResolvedFight {
  const gap = averageAbility(a) - averageAbility(b);
  const slope = tier === 2 ? params.abilitySlope : params.abilitySlope * 0.7;
  const pA = 1 / (1 + Math.exp(-gap * slope));

  const early = rng.next() * 100 < params.earlyPct;
  if (early) {
    const endingRound = Math.min(rounds, pickFromHistogram(params.roundHistogram, rng));
    const winner = rng.next() < pA ? 'a' : 'b';
    const method: FightMethod = rng.next() < params.koShare ? 'KO' : rng.next() < 0.93 ? 'TKO' : 'RTD';
    return { method, winner, endingRound, tier };
  }

  if (rng.next() * 100 < params.drawPct / (1 - params.earlyPct / 100)) {
    return { method: 'D', winner: null, endingRound: rounds, tier };
  }
  const winner = rng.next() < pA ? 'a' : 'b';
  const split = rng.next() * 100 < params.splitPct;
  const method: FightMethod = split ? (rng.next() < 0.7 ? 'SD' : 'MD') : 'UD';
  return { method, winner, endingRound: rounds, tier };
}

/** Плани сторін. Порожньо для боїв без гравця — у бійців ШІ планів немає. */
export interface FightPlans {
  a?: FightPlanId;
  b?: FightPlanId;
}

export function resolveFight(
  tier: SimTier, a: Fighter, b: Fighter, rounds: number, rng: Rng, weightGroup: string,
  plans: FightPlans = {},
): ResolvedFight {
  if (tier === 1) return resolveTier1(a, b, rounds, rng, plans);
  const params = TIER_APPROXIMATION[weightGroup] ?? TIER_APPROXIMATION['middle'] as TierApproximation;
  return resolveApproximate(a, b, rounds, rng, tier, params as TierApproximation);
}
