import raw from './reference/development.json' with { type: 'json' };

/**
 * Коефіцієнти розвитку й старіння бійця (ADR-0031). Живуть у JSON, не в рушії світу:
 * `AGENTS.md` §4. Будь-яка зміна — **клас A**: атрибути змінюються, а з ними й бої.
 */
export type AttributeGroup = 'technical' | 'physical' | 'mental';

export interface DevelopmentTuning {
  tickEveryDays: number;
  peakAge: { byGroup: Record<string, number>; spread: number };
  growth: {
    base: number; youthSpanYears: number; minYouth: number; maxYouth: number;
    taperPoints: number; workRateWeight: number; focusMultiplier: number;
  };
  decline: { base: number; groupWeight: Record<AttributeGroup, number>; chinPerHeadTrauma: number };
  focusGroups: Record<string, AttributeGroup>;
}

const { _note: _ignored, ...tuning } = raw as unknown as DevelopmentTuning & { _note: string };
export const DEVELOPMENT_TUNING: DevelopmentTuning = tuning;
