import type { StyleAxis } from '@bm/core-model';
import raw from './reference/fight-plans.json' with { type: 'json' };

/**
 * Готові плани на бій (ADR-0023). Гравець обирає один перед боєм — це третій і останній
 * тип його рішень. Значення — **зсуви** до власних осей бійця (ADR-0011), а не нові осі:
 * план не перетворює аутбоксера на пресинг-файтера, він лише зміщує акцент.
 */
export const FIGHT_PLANS = ['balanced', 'boxing', 'pressure', 'counter', 'bodywork'] as const;
export type FightPlanId = (typeof FIGHT_PLANS)[number];

const { _note, ...groups } = raw as Record<string, unknown>;
void _note;

export const FIGHT_PLAN_AXES = Object.fromEntries(
  Object.entries(groups).map(([id, value]) => [id, (value as { axes: Partial<Record<StyleAxis, number>> }).axes]),
) as Record<FightPlanId, Partial<Record<StyleAxis, number>>>;

export const isFightPlanId = (value: string): value is FightPlanId =>
  (FIGHT_PLANS as readonly string[]).includes(value);
