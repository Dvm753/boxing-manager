import type { Attributes, StyleAxes } from '@bm/core-model';

/** Градації влучання (ADR-0012). Розширення словника = новий ADR. */
export const LAND_QUALITIES = ['miss', 'block', 'partial', 'glancing', 'clean', 'heavy', 'critical'] as const;
export type LandQuality = (typeof LAND_QUALITIES)[number];

/** Влучанням у статистиці вважається `partial` і вище; `block` у лог потрапляє, але не влучання. */
export const LANDED_QUALITIES: readonly LandQuality[] = ['partial', 'glancing', 'clean', 'heavy', 'critical'];

export const PUNCH_TYPES = ['jab', 'cross', 'hook', 'uppercut', 'bodyShot'] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const POSITIONS = ['out-of-range', 'long', 'mid', 'inside', 'clinch', 'ropes'] as const;
export type Position = (typeof POSITIONS)[number];

/** Фоли без дискваліфікації (ADR-0027). Дискваліфікація — окреме, ще не ухвалене рішення. */
export const FOUL_KINDS = ['low-blow', 'holding', 'headbutt'] as const;
export type FoulKind = (typeof FOUL_KINDS)[number];

export type FighterSide = 'a' | 'b';

/** Зліпок бійця. Рушій не бачить живої сутності й не може мутувати світ. */
export interface FighterSnapshot {
  id: string;
  attributes: Attributes;
  styleAxes: StyleAxes;
  heightCm: number;
  reachCm: number;
  /** 0–100 */
  sharpness: number;
  /** 0–100 */
  freshness: number;
  /** 0–100, накопичений знос голови за кар'єру */
  headTrauma: number;
}

export interface JudgeProfile {
  id: string;
  /** Ваги, сума не обов'язково 1 — нормалізується в суддівстві. */
  cleanPunching: number;
  aggression: number;
  ringGeneralship: number;
  defence: number;
  /** -1..1, перевага одному з бійців (домашня перевага, вага імені) */
  bias: number;
}

/** Порожній план означає «бійся за своїми осями» — поведінка фази 0 (ADR-0014). */
export interface RoundBlockPlan {
  fromRound: number;
  toRound: number;
  axisAdjustments: Partial<StyleAxes>;
}

export interface FightPlan {
  baseAxes?: Partial<StyleAxes>;
  blocks: readonly RoundBlockPlan[];
}

export const EMPTY_PLAN: FightPlan = { blocks: [] };

export interface FightContext {
  scheduledRounds: number;
  judges: readonly [JudgeProfile, JudgeProfile, JudgeProfile];
  planA: FightPlan;
  planB: FightPlan;
  /** Правило трьох нокдаунів за раунд — опційне за комісією. */
  threeKnockdownRule: boolean;
}

/**
 * Секунда всередині раунду, 0–179 (ADR-0025, закриває Q30). Рушій іде обмінами
 * (`exchangesPerRound`), не секундами — час це номер обміну, перекладений у секунди
 * трихвилинного раунду. Нової випадковості тут немає: подія лише показує те, що
 * рушій і так знав, коли її породжував.
 */
export type FightEvent =
  | { t: 'roundStart'; round: number }
  | {
      t: 'punch'; round: number; second: number; by: FighterSide;
      punch: PunchType; quality: LandQuality; position: Position;
    }
  | { t: 'knockdown'; round: number; second: number; by: FighterSide; count: number }
  | { t: 'cut'; round: number; second: number; on: FighterSide; location: 'left-eye' | 'right-eye' | 'forehead' }
  | { t: 'stun'; round: number; second: number; on: FighterSide }
  | { t: 'planChange'; round: number; second: number; by: FighterSide }
  /**
   * Фол (ADR-0027). `penalized: false` — перше порушення цього типу за бій, лише
   * попередження; `true` — друге й далі, бал знято з поточного раунду.
   */
  | { t: 'foul'; round: number; second: number; by: FighterSide; kind: FoulKind; penalized: boolean }
  | {
      t: 'roundEnd'; round: number;
      /** Картка кожного судді за цей раунд, у порядку `context.judges` (закриває Q31). */
      cards: readonly (readonly [number, number])[];
      /** Втома 0–100 наприкінці раунду, до відновлення в кутку (закриває Q31). */
      staminaA: number; staminaB: number;
      /** Накопичена шкода наприкінці раунду, до відновлення в кутку (закриває Q31). */
      headDamageA: number; headDamageB: number;
      bodyDamageA: number; bodyDamageB: number;
    }
  | { t: 'stoppage'; round: number; second: number; winner: FighterSide; reason: 'ko' | 'tko' | 'rtd' }
  | { t: 'decision'; kind: 'UD' | 'SD' | 'MD' | 'D'; winner: FighterSide | null };

export type FightMethod = 'KO' | 'TKO' | 'RTD' | 'UD' | 'SD' | 'MD' | 'D';

export interface FightStats {
  thrown: number;
  landed: number;
  jabsThrown: number;
  jabsLanded: number;
  powerThrown: number;
  powerLanded: number;
  knockdowns: number;
}

export interface FightResult {
  method: FightMethod;
  winner: FighterSide | null;
  /** Раунд завершення; для рішення — останній раунд. */
  endingRound: number;
  /** Картки суддів, коли бій дійшов до рішення. */
  scorecards: readonly (readonly [number, number])[];
  statsA: FightStats;
  statsB: FightStats;
}

export interface FightOutcome {
  result: FightResult;
  eventLog: readonly FightEvent[];
}

/**
 * Стан на межі раундів (ADR-0028). `simulateFightSteps` віддає це після кожного
 * `roundEnd`, поки бій не завершився. `eventLog` — повний лог станом на цю мить,
 * той самий масив, що піде в підсумковий `FightOutcome`.
 */
export interface RoundBoundary {
  round: number;
  eventLog: readonly FightEvent[];
}

/**
 * Порада кута між раундами (ADR-0028): невеликий, обмежений у часі зсув осей —
 * той самий контракт, що й `RoundBlockPlan` (ADR-0014), нічого нового в рушії.
 * Рушій не знає про «сценарії» чи «придатність» — це відповідальність того, хто
 * породжує пораду (`packages/ai`), рушій лише додає блок до плану активної сторони.
 */
export interface FightStepUpdate {
  a?: RoundBlockPlan;
  b?: RoundBlockPlan;
}
