import { describe, it, expect } from 'vitest';
import { ALL_ATTRIBUTES, STYLE_AXES } from '@bm/core-model';
import {
  STRATEGY_PLANS, STRATEGY_SCENARIOS, STRATEGY_PLAN_AXES, STRATEGY_PLAN_SUITABILITY,
  STRATEGY_SCENARIO_AXES, STRATEGY_SCENARIO_ADVICE_BOUNDS, strategyBaseAxes, isStrategyPlanId, isStrategyScenarioId,
} from '../src/strategy-plans.js';

/**
 * Три плани і три сценарії (ADR-0028) — дані, не рушій. Тести перевіряють цілісність
 * JSON (ключі осей і атрибутів справжні) і саму функцію складання, а не баланс —
 * баланс перевіряє гейт ADR-0008 на реальних боях.
 */
describe('стратегічні плани й сценарії (ADR-0028)', () => {
  it('рівно три плани й три сценарії', () => {
    expect(STRATEGY_PLANS).toHaveLength(3);
    expect(STRATEGY_SCENARIOS).toEqual(['A', 'B', 'C']);
  });

  it('усі ключі осей у планах і сценаріях — справжні StyleAxis', () => {
    for (const plan of STRATEGY_PLANS) {
      for (const axis of Object.keys(STRATEGY_PLAN_AXES[plan])) {
        expect(STYLE_AXES as readonly string[]).toContain(axis);
      }
    }
    for (const scenario of STRATEGY_SCENARIOS) {
      for (const axis of Object.keys(STRATEGY_SCENARIO_AXES[scenario])) {
        expect(STYLE_AXES as readonly string[]).toContain(axis);
      }
    }
  });

  it('усі атрибути придатності — справжні (видимі) атрибути моделі', () => {
    for (const plan of STRATEGY_PLANS) {
      for (const attr of STRATEGY_PLAN_SUITABILITY[plan]) {
        expect(ALL_ATTRIBUTES as readonly string[]).toContain(attr);
      }
    }
  });

  it('сценарій B (збалансований) не додає жодного зсуву — план діє як є', () => {
    expect(STRATEGY_SCENARIO_AXES.B).toEqual({});
    for (const plan of STRATEGY_PLANS) {
      expect(strategyBaseAxes(plan, 'B')).toEqual(STRATEGY_PLAN_AXES[plan]);
    }
  });

  it('strategyBaseAxes складає план і сценарій по осях, а не замінює', () => {
    const distanceC = strategyBaseAxes('distance', 'C');
    // Дистанція: risk відсутній у плані, сценарій C додає +2 — результат саме +2, не 0.
    expect(distanceC.risk).toBe(2);
    // punchVolume відсутній у плані "distance", сценарій C додає +2.
    expect(distanceC.punchVolume).toBe(2);
    // preferredRange є лише в плані — сценарій його не чіпає.
    expect(distanceC.preferredRange).toBe(STRATEGY_PLAN_AXES.distance.preferredRange);
  });

  it('isStrategyPlanId / isStrategyScenarioId відкидають сторонні рядки', () => {
    expect(isStrategyPlanId('distance')).toBe(true);
    expect(isStrategyPlanId('bodywork')).toBe(false);
    expect(isStrategyScenarioId('B')).toBe(true);
    expect(isStrategyScenarioId('D')).toBe(false);
  });
});

describe('межі порад кута за сценарієм (ADR-0028 §6, Q35)', () => {
  it('A і C — модуль власних зсувів сценарію', () => {
    expect(STRATEGY_SCENARIO_ADVICE_BOUNDS.A).toEqual({ risk: 2, punchVolume: 1 });
    expect(STRATEGY_SCENARIO_ADVICE_BOUNDS.C).toEqual({ risk: 2, punchVolume: 2, bodyAttack: 1 });
  });

  it('B сам осей не зсуває, але має малий простір для порад', () => {
    expect(STRATEGY_SCENARIO_AXES.B).toEqual({});
    expect(STRATEGY_SCENARIO_ADVICE_BOUNDS.B).toEqual({ risk: 1, punchVolume: 1 });
  });

  it('простір B — найменший із трьох', () => {
    const size = (b: Record<string, number | undefined>): number =>
      Object.values(b).reduce<number>((s, v) => s + (v ?? 0), 0);
    expect(size(STRATEGY_SCENARIO_ADVICE_BOUNDS.B)).toBeLessThan(size(STRATEGY_SCENARIO_ADVICE_BOUNDS.A));
    expect(size(STRATEGY_SCENARIO_ADVICE_BOUNDS.B)).toBeLessThan(size(STRATEGY_SCENARIO_ADVICE_BOUNDS.C));
  });
});
