/**
 * Коефіцієнти рушія. Будь-яка зміна тут — **клас A** (`CHANGE_CONTROL_POLICY`):
 * це зміна правил гри, а не тюнінг. Golden-тести під коридори ADR-0008 —
 * єдиний спосіб довести, що зміна не зіпсувала баланс.
 */
export const TUNING = {
  /** Обмінів за раунд: 180 с / ~5–8 с на обмін. */
  exchangesPerRound: 62,

  /** Базова ймовірність влучання до захисту і втоми. */
  baseLandChance: { jab: 0.40, cross: 0.34, hook: 0.33, uppercut: 0.29, bodyShot: 0.38 },

  /** Внесок шкоди в голову за градацією. */
  headDamage: { miss: 0, block: 0.032, partial: 0.103, glancing: 0.190, clean: 0.440, heavy: 1.075, critical: 2.17 },
  bodyDamage: { miss: 0, block: 0.04, partial: 0.16, glancing: 0.26, clean: 0.58, heavy: 1.25, critical: 2.20 },

  /** Витрата витривалості за кинутий удар і відновлення між раундами. */
  staminaPerPunch: 0.16,
  staminaRecoveryPerRound: 9.0,

  /** Поріг накопиченої шкоди голови, від якого починається ризик нокдауну. */
  knockdownThreshold: 55,
  /** Множник шансу нокдауну від critical-влучання. */
  flashKnockdownChance: 0.020,
  /** Шанс, що боєць не встане, залежно від накопиченої шкоди. */
  koOnKnockdownBase: 0.13,

  /** Рефері зупиняє бій, коли шкода перевищує поріг і боєць беззахисний. */
  refereeStopThreshold: 96,
  /** Кут викидає рушник — залежить від шкоди й відставання за очками. */
  cornerRetirementChance: 0.012,

  /** Розкид упереджень суддів: більший розкид → більше роздільних рішень. */
  judgeNoise: 0.14,
  /** Сила якоріння судді на власну попередню оцінку бою. */
  judgeAnchoring: 0.16,

  /**
   * Фоли (ADR-0027). Раз на обмін є малий шанс фолу замість звичайної дії:
   * `foulBaseChance × (foulDirtinessBase + normalize(dirtiness) × foulDirtinessScale) × positionMultiplier[position]`.
   */
  foulBaseChance: 0.003,
  foulDirtinessBase: 0.4,
  foulDirtinessScale: 1.2,
  foulPositionMultiplier: {
    'out-of-range': 0.1, long: 0.4, mid: 0.8, inside: 1.3, clinch: 1.9, ropes: 1.0,
  },
  /** Шанс розсічення в атакованого від випадкового зіткнення головами. */
  foulHeadbuttCutChance: 0.10,
  /** Раунд із відібраними балами не опускається нижче цього — навіть найгірший фол не топить картку. */
  foulMinRoundScore: 5,

  /**
   * Коронні прийоми атаки (Q34): невеликий зсув вибору удару й невеликий бонус
   * якості, коли кинутий удар збігається з активним прийомом бійця. Прийоми самі —
   * похідна від атрибутів (`@bm/core-model` `attackSignatures`), рушій лише читає.
   */
  signatureBonus: {
    jab: 0.015,
    uppercut: 0.03,
    cross: 0.02,
    body: 0.02,
    combinationExtra: 0.01,
  },
  /** Бонус до offence у resolveQuality, коли влучання — саме коронним ударом. */
  signatureQualityBonus: 0.004,
} as const;
