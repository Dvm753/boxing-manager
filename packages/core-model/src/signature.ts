import { normalize, type Attributes } from './attributes.js';

/**
 * Коронні прийоми атаки (Q34, `docs/research/Q34_SIGNATURE_TRAITS.md`). Похідна від
 * атрибутів — як `styleLabel` від осей: жодного нового поля на бійця, жодної
 * випадковості. Бійцю може відповідати 0, 1 чи кілька прийомів одночасно.
 *
 * Оборонні прийоми з того самого дослідження свідомо не входять сюди — окреме
 * рішення, як домовлено з власником.
 */
export const ATTACK_SIGNATURES = [
  'jabSpecialist', 'hookSpecialist', 'uppercutInside',
  'bodySpecialist', 'combinationPuncher', 'onetwoSpecialist',
] as const;

export type AttackSignature = (typeof ATTACK_SIGNATURES)[number];

const a01 = normalize;

/**
 * Наскільки атрибут випереджає власний середній рівень бійця з ударів, а не
 * абсолютну шкалу — виміряно на генерованому світі (`tools/`, разова перевірка):
 * типове відхилення від власного середнього серед п'яти ударних атрибутів
 * лежить у 0–2.4 (raw 1–20), тож 0.08 (~1.5 raw) лишає прийом рідкісним,
 * але не вимираючим.
 */
const MARGIN = 0.08;
/** Сама спеціалізація має бути пристойною, не просто «найкраща з поганих». */
const FLOOR = 0.5;
/** Для прийомів, що вимагають окремого, непов'язаного атрибута (не спред серед ударів). */
const ELITE_FLOOR = 0.68;

/**
 * Прийоми атаки, що активні для цього профілю атрибутів. Поріг — відносний
 * (відхилення від середнього серед `jab/cross/hook/uppercut/bodyPunching` цього
 * самого бійця), тому елітний боєць не отримує всі прийоми одразу, а посередній
 * зі справді нерівним профілем — отримує.
 */
export function attackSignatures(attributes: Attributes): readonly AttackSignature[] {
  const { jab, cross, hook, uppercut, bodyPunching, insideFighting, combinations, handSpeed } = attributes;
  const punches = [jab, cross, hook, uppercut, bodyPunching].map(a01);
  const avg = punches.reduce((s, v) => s + v, 0) / punches.length;

  const njab = a01(jab); const ncross = a01(cross); const nhook = a01(hook); const nup = a01(uppercut);
  const nbody = a01(bodyPunching);

  const out: AttackSignature[] = [];
  if (njab >= avg + MARGIN && njab >= FLOOR) out.push('jabSpecialist');
  if (nhook >= avg + MARGIN && nhook >= FLOOR) out.push('hookSpecialist');
  if (nup >= avg + MARGIN && nup >= FLOOR && a01(insideFighting) >= ELITE_FLOOR) out.push('uppercutInside');
  if (nbody >= avg + MARGIN && nbody >= FLOOR) out.push('bodySpecialist');
  if (a01(combinations) >= ELITE_FLOOR && a01(handSpeed) >= ELITE_FLOOR) out.push('combinationPuncher');
  if (njab >= avg + MARGIN / 2 && ncross >= avg + MARGIN / 2 && nhook < avg && nup < avg) out.push('onetwoSpecialist');
  return out;
}
