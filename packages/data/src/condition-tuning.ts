import raw from './reference/condition.json' with { type: 'json' };

/**
 * Коефіцієнти динаміки форми (ADR-0022). Живуть у JSON, а не в рушії: `AGENTS.md` §4.
 * Будь-яка зміна цих чисел — **клас A**, бо вона змінює вхідні дані рушія бою.
 */
export interface SharpnessTuning {
  /** Спад за день поза табором — ринг-руст. */
  idleDecayPerDay: number;
  /** Нижче цього гострота не падає: навіть після років простою боєць не забуває, як боксувати. */
  floor: number;
  /** За скільки днів до бою починається табір. */
  campWindowDays: number;
  campGainPerDay: number;
  /** Сам бій теж гострить. */
  fightGain: number;
  ceilingBase: number;
  ceilingPerWorkRate: number;
  ceilingPerProfessionalism: number;
}

export interface FreshnessTuning {
  postFightBase: number;
  postFightPerRound: number;
  postFightPerHeadDelta: number;
  recoveryPerDay: number;
  /** Множник до атрибута `recovery`. */
  recoveryPerAttribute: number;
  /** Табір виснажує: свіжість у таборі зростає повільніше. */
  campFatiguePerDay: number;
  floor: number;
  max: number;
}

const { _note, ...groups } = raw as Record<string, unknown>;
void _note;

export const CONDITION_TUNING = groups as unknown as {
  sharpness: SharpnessTuning;
  freshness: FreshnessTuning;
};
