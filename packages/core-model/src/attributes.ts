/**
 * Атрибути бійця. Шкала 1–20 для показу і для обчислень (ADR-0006).
 *
 * Нормалізація в [0,1] робиться в точці використання і ніде не зберігається —
 * другої шкали в моделі не існує.
 */
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 20;

export type AttributeValue = number;

export const TECHNICAL_ATTRIBUTES = [
  'jab', 'cross', 'hook', 'uppercut', 'bodyPunching', 'combinations', 'counterPunching',
  'accuracy', 'feinting', 'insideFighting', 'clinching', 'blocking', 'headMovement',
  'footwork', 'distanceControl', 'defensiveDiscipline',
] as const;

export const PHYSICAL_ATTRIBUTES = [
  'handSpeed', 'footSpeed', 'punchPower', 'stamina', 'recovery', 'strength', 'balance', 'coordination',
] as const;

export const MENTAL_ATTRIBUTES = [
  'ringIq', 'composure', 'aggression', 'bravery', 'adaptability', 'concentration',
  'killerInstinct', 'workRate', 'discipline',
] as const;

/** Гравцю не показуються ніколи (DOMAIN_MODEL.md). */
export const HIDDEN_ATTRIBUTES = [
  'chin', 'heart', 'cutResistance', 'injuryProneness', 'consistency', 'professionalism',
  'ambition', 'bigFightTemperament', 'weightDiscipline', 'dirtiness',
] as const;

export type TechnicalAttribute = (typeof TECHNICAL_ATTRIBUTES)[number];
export type PhysicalAttribute = (typeof PHYSICAL_ATTRIBUTES)[number];
export type MentalAttribute = (typeof MENTAL_ATTRIBUTES)[number];
export type HiddenAttribute = (typeof HIDDEN_ATTRIBUTES)[number];
export type AttributeKey = TechnicalAttribute | PhysicalAttribute | MentalAttribute | HiddenAttribute;

export const ALL_ATTRIBUTES: readonly AttributeKey[] = [
  ...TECHNICAL_ATTRIBUTES, ...PHYSICAL_ATTRIBUTES, ...MENTAL_ATTRIBUTES, ...HIDDEN_ATTRIBUTES,
];

export type Attributes = Record<AttributeKey, AttributeValue>;

export function isValidAttribute(value: number): boolean {
  return Number.isInteger(value) && value >= ATTRIBUTE_MIN && value <= ATTRIBUTE_MAX;
}

/** Повертає перелік порушень замість того, щоб кидати: виклик сам вирішує, як реагувати. */
export function validateAttributes(attributes: Attributes): string[] {
  const problems: string[] = [];
  for (const key of ALL_ATTRIBUTES) {
    const value = attributes[key];
    if (!isValidAttribute(value)) {
      problems.push(`${key}=${value} поза діапазоном ${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX} або не ціле`);
    }
  }
  return problems;
}

/** Нормалізація в [0,1] для формул рушія. Не зберігається. */
export function normalize(value: AttributeValue): number {
  return (value - ATTRIBUTE_MIN) / (ATTRIBUTE_MAX - ATTRIBUTE_MIN);
}
