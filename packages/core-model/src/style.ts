/**
 * Стиль як шість осей (ADR-0011).
 *
 * Джерело правди — осі. Мітка обчислюється з них для показу і для ШІ-матчмейкінгу.
 * Рушій бою читає осі; `switch` по мітці в коді рушія — дефект.
 */
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from './attributes.js';

export const STYLE_AXES = [
  'preferredRange',   // 1 далеко ... 20 впритул
  'pressure',         // 1 низький тиск ... 20 високий
  'punchVolume',      // 1 низький об'єм ... 20 високий
  'risk',             // 1 безпечно ... 20 ризиковано
  'counterTendency',  // 1 не контратакує ... 20 контратакує постійно
  'bodyAttack',       // 1 не б'є по корпусу ... 20 б'є багато
] as const;

export type StyleAxis = (typeof STYLE_AXES)[number];
export type StyleAxes = Record<StyleAxis, number>;

export type StyleLabel =
  | 'out-boxer' | 'boxer-puncher' | 'pressure-fighter' | 'slugger'
  | 'counter-puncher' | 'switch-hitter' | 'spoiler';

export function validateAxes(axes: StyleAxes): string[] {
  const problems: string[] = [];
  for (const axis of STYLE_AXES) {
    const v = axes[axis];
    if (!Number.isInteger(v) || v < ATTRIBUTE_MIN || v > ATTRIBUTE_MAX) {
      problems.push(`${axis}=${v} поза діапазоном ${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX} або не ціле`);
    }
  }
  return problems;
}

/**
 * Мітка — похідна від осей. Порядок перевірок задає пріоритет: спершу вузькі
 * впізнавані профілі, потім загальні.
 */
export function styleLabel(axes: StyleAxes): StyleLabel {
  const { preferredRange, pressure, punchVolume, risk, counterTendency, bodyAttack } = axes;

  if (counterTendency >= 15 && risk <= 10) return 'counter-puncher';
  if (preferredRange >= 14 && pressure <= 9 && punchVolume <= 10) return 'spoiler';
  if (pressure >= 14 && punchVolume >= 13) return 'pressure-fighter';
  if (risk >= 15 && punchVolume <= 11) return 'slugger';
  if (preferredRange <= 8 && punchVolume >= 11) return 'out-boxer';
  if (bodyAttack >= 14 && pressure >= 11) return 'switch-hitter';
  return 'boxer-puncher';
}
