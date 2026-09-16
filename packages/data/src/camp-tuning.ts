import raw from './reference/camp.json' with { type: 'json' };

/**
 * Коефіцієнти табору (ADR-0023). Живуть у JSON, не в рушії: `AGENTS.md` §4.
 * Будь-яка зміна цих чисел — **клас A**: вона змінює вхідні дані рушія бою через форму.
 */
export const CAMP_PHASES = ['base', 'work', 'taper'] as const;
export type CampPhase = (typeof CAMP_PHASES)[number];

export const CAMP_LOADS = ['light', 'normal', 'heavy'] as const;
export type CampLoad = (typeof CAMP_LOADS)[number];

/** Фокуси згруповані за фазами: у підводці не «спаринг», а «підводка», «вага» або «відпочинок». */
export const CAMP_FOCUSES_BY_PHASE = {
  base: ['general', 'strength', 'stamina'],
  work: ['technique', 'sparring', 'tactics'],
  taper: ['peak', 'weight', 'rest'],
} as const;

export type CampFocus = (typeof CAMP_FOCUSES_BY_PHASE)[CampPhase][number];

export const CAMP_FOCUSES: readonly CampFocus[] = [
  ...CAMP_FOCUSES_BY_PHASE.base, ...CAMP_FOCUSES_BY_PHASE.work, ...CAMP_FOCUSES_BY_PHASE.taper,
];

export interface CampModifier {
  sharpness: number;
  fatigue: number;
  injury: number;
}

export interface CampTuning {
  phases: Record<CampPhase, { from: number; to: number }>;
  load: Record<CampLoad, CampModifier>;
  focus: Record<CampFocus, CampModifier>;
  defaults: Record<CampPhase, { focus: CampFocus; load: CampLoad }>;
  injury: {
    baseChancePerDay: number;
    perInjuryProneness: number;
    daysOutBase: number;
    daysOutPerProneness: number;
  };
  decision: { offerDeadlineDays: number; phaseDeadlineDays: number };
}

const { _note, ...groups } = raw as Record<string, unknown>;
void _note;

export const CAMP_TUNING = groups as unknown as CampTuning;

/** Фаза табору за кількістю днів до бою; `null` — табір ще не відкрився або бій уже був. */
export function campPhaseFor(daysToFight: number): CampPhase | null {
  for (const phase of CAMP_PHASES) {
    const range = CAMP_TUNING.phases[phase];
    if (daysToFight <= range.from && daysToFight >= range.to) return phase;
  }
  return null;
}

export const isCampFocusOfPhase = (phase: CampPhase, focus: CampFocus): boolean =>
  (CAMP_FOCUSES_BY_PHASE[phase] as readonly string[]).includes(focus);
