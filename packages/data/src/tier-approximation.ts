import raw from './reference/tier-approximation.json' with { type: 'json' };

/**
 * Параметри наближення рівнів 2 і 3 (ADR-0015). **Виміряні** з повної симуляції
 * інструментом `tools/measure-tiers.ts`, не задані вручну.
 * Перегенерувати після будь-якої зміни рушія бою або його коефіцієнтів.
 */
export interface TierApproximation {
  earlyPct: number;
  koShare: number;
  /** Частки завершень по раундах 1..12, сума ≈ 1. */
  roundHistogram: readonly number[];
  drawPct: number;
  splitPct: number;
  /** Нахил логістики «різниця в майстерності → ймовірність перемоги». */
  abilitySlope: number;
  measuredFrom: { fights: number; seed: number; rounds: number };
}

const { _note, ...groups } = raw as Record<string, unknown>;
void _note;

export const TIER_APPROXIMATION = groups as unknown as Record<string, TierApproximation>;
