import type { MentalAttribute, PhysicalAttribute, StyleAxis, TechnicalAttribute } from '@bm/core-model';
import raw from './reference/strategy-plans.json' with { type: 'json' };

/**
 * Три стратегічні плани на бій і сценарії A/B/C (ADR-0028) — рішення безпосередньо
 * перед боєм, окреме від табірного «плану на бій» (`FIGHT_PLANS`, ADR-0023). Гравець
 * обирає план (тактичний профіль) і сценарій (інтенсивність); дельти складаються
 * в один `FightPlan.baseAxes` для рушія (ADR-0014) — нових осей чи механік немає.
 */
export const STRATEGY_PLANS = ['distance', 'pressure', 'counter'] as const;
export type StrategyPlanId = (typeof STRATEGY_PLANS)[number];

export const STRATEGY_SCENARIOS = ['A', 'B', 'C'] as const;
export type StrategyScenarioId = (typeof STRATEGY_SCENARIOS)[number];

export type VisibleAttribute = TechnicalAttribute | PhysicalAttribute | MentalAttribute;

interface RawPlan { axes: Partial<Record<StyleAxis, number>>; suitability: readonly VisibleAttribute[] }
interface RawScenario {
  axes: Partial<Record<StyleAxis, number>>;
  /** Явна межа порад кута; без неї межа — модуль власних зсувів сценарію (ADR-0028). */
  adviceMaxDelta?: Partial<Record<StyleAxis, number>>;
}
interface RawFile { plans: Record<StrategyPlanId, RawPlan>; scenarios: Record<StrategyScenarioId, RawScenario> }

const { plans, scenarios } = raw as unknown as RawFile;

export const STRATEGY_PLAN_AXES: Record<StrategyPlanId, Partial<Record<StyleAxis, number>>> =
  Object.fromEntries(STRATEGY_PLANS.map((id) => [id, plans[id].axes])) as never;

/** Атрибути, на яких тренер оцінює придатність плану бійцю (ADR-0028) — не впливають на бій. */
export const STRATEGY_PLAN_SUITABILITY: Record<StrategyPlanId, readonly VisibleAttribute[]> =
  Object.fromEntries(STRATEGY_PLANS.map((id) => [id, plans[id].suitability])) as never;

export const STRATEGY_SCENARIO_AXES: Record<StrategyScenarioId, Partial<Record<StyleAxis, number>>> =
  Object.fromEntries(STRATEGY_SCENARIOS.map((id) => [id, scenarios[id].axes])) as never;

/**
 * Межа порад кута на сценарій (ADR-0028 §6): наскільки порада може зсунути вісь у будь-який
 * бік. За замовчуванням — модуль зсувів самого сценарію; сценарій може задати її явно
 * (`adviceMaxDelta`) — так B, що сам осей не зсуває, отримує малий простір ±1 (Q35).
 */
export const STRATEGY_SCENARIO_ADVICE_BOUNDS: Record<StrategyScenarioId, Partial<Record<StyleAxis, number>>> =
  Object.fromEntries(STRATEGY_SCENARIOS.map((id) => {
    const explicit = scenarios[id].adviceMaxDelta;
    if (explicit) return [id, { ...explicit }];
    const bounds: Partial<Record<StyleAxis, number>> = {};
    for (const [axis, delta] of Object.entries(scenarios[id].axes)) bounds[axis as StyleAxis] = Math.abs(delta as number);
    return [id, bounds];
  })) as never;

export const isStrategyPlanId = (value: string): value is StrategyPlanId =>
  (STRATEGY_PLANS as readonly string[]).includes(value);

export const isStrategyScenarioId = (value: string): value is StrategyScenarioId =>
  (STRATEGY_SCENARIOS as readonly string[]).includes(value);

/**
 * Комбінований зсув осей для обраного плану й сценарію — прямий вхід у `FightPlan.baseAxes`.
 * Сценарій накладається на план (значення осі сумуються), не замінює його.
 */
export function strategyBaseAxes(
  plan: StrategyPlanId, scenario: StrategyScenarioId,
): Partial<Record<StyleAxis, number>> {
  const result: Partial<Record<StyleAxis, number>> = { ...STRATEGY_PLAN_AXES[plan] };
  for (const [axis, delta] of Object.entries(STRATEGY_SCENARIO_AXES[scenario])) {
    const key = axis as StyleAxis;
    result[key] = (result[key] ?? 0) + (delta as number);
  }
  return result;
}
