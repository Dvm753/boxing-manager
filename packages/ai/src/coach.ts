import { normalize, type Fighter, type Rng, type StyleAxis } from '@bm/core-model';
import {
  STRATEGY_PLAN_AXES, STRATEGY_PLAN_SUITABILITY, STRATEGY_SCENARIO_AXES,
  type StrategyPlanId, type StrategyScenarioId,
} from '@bm/data';

/**
 * Тренер (ADR-0028): порада на вибір стратегічного плану й сценарію A/B/C перед боєм.
 * Чиста функція без стану і без I/O (`AGENTS.md` §3) — той самий розрахунок для
 * гравця й ШІ, як і решта пакета `ai`.
 *
 * **Скіл тренера** — тимчасова шкала-заглушка 1–20, та сама шкала, що й атрибути
 * бійця. Немає окремої сутності Trainer/Staff: одне число визначає лише точність
 * показаної гравцю придатності, не сам бій і не вибір гравця.
 */
export type CoachSkill = number;

const a01 = normalize;

/**
 * «Справжня» придатність плану й сценарію бійцю, 0–100 — гравець її не бачить,
 * лише зашумлену тренером версію нижче. Три складові порівну:
 * - чи природно лежать осі стилю бійця в бік того, куди тягне план;
 * - чи сильні релевантні атрибути (`STRATEGY_PLAN_SUITABILITY`);
 * - чи витягне свіжість/гострота форсований темп обраного сценарію.
 */
function trueSuitability(fighter: Fighter, plan: StrategyPlanId, scenario: StrategyScenarioId): number {
  const planAxes = STRATEGY_PLAN_AXES[plan];
  const axisEntries = Object.entries(planAxes) as [StyleAxis, number][];
  const axesScore = axisEntries.length === 0 ? 50 : (axisEntries.reduce((sum, [axis, delta]) => {
    const v = a01(fighter.styleAxes[axis]);
    return sum + (delta > 0 ? v : delta < 0 ? 1 - v : 0.5);
  }, 0) / axisEntries.length) * 100;

  const attrs = STRATEGY_PLAN_SUITABILITY[plan];
  const attrScore = attrs.length === 0 ? 50
    : (attrs.reduce((sum, key) => sum + a01(fighter.attributes[key]), 0) / attrs.length) * 100;

  const scenarioAxes = STRATEGY_SCENARIO_AXES[scenario];
  const intensity = Object.values(scenarioAxes).reduce((sum, delta) => sum + Math.abs(delta), 0);
  const readiness = (fighter.condition.sharpness / 100) * 0.6 + (fighter.condition.freshness / 100) * 0.4;
  // Форсований сценарій (велика intensity) карає низьку готовність сильніше, ніж обережний.
  const scenarioScore = 100 - (1 - readiness) * Math.min(1, intensity / 6) * 100;

  return axesScore * 0.4 + attrScore * 0.4 + scenarioScore * 0.2;
}

/**
 * Показана гравцю придатність плану й сценарію, 0–100 — та сама оцінка, зашумлена
 * якістю тренера. Слабкий тренер (низький `coachSkill`) може показати гіршу чи кращу
 * оцінку, ніж насправді; сильний (20) показує майже точну. Вибір лишається за
 * гравцем завжди — це лише текст поради, не блокування (ADR-0028).
 */
export function coachSuitability(
  fighter: Fighter, plan: StrategyPlanId, scenario: StrategyScenarioId,
  coachSkill: CoachSkill, rng: Rng,
): number {
  const truth = trueSuitability(fighter, plan, scenario);
  const noiseScale = (1 - a01(coachSkill)) * 25;
  const noise = (rng.next() * 2 - 1) * noiseScale;
  return Math.max(0, Math.min(100, Math.round(truth + noise)));
}
