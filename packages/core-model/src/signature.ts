import { normalize, type Attributes } from './attributes.js';

/**
 * Коронні прийоми атаки (Q34, `docs/research/Q34_SIGNATURE_TRAITS.md`). Похідна від
 * атрибутів — як `styleLabel` від осей: жодного нового поля на бійця, жодної
 * випадковості. Бійцю може відповідати 0, 1 чи кілька прийомів одночасно.
 *
 * Оборонні прийоми — `defenseSignatures` нижче (друга частина Q34, окреме
 * погодження власника); атака й оборона незалежні одна від одної.
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

/**
 * Коронні прийоми оборони (Q34, друга частина) — та сама структура, що й атака:
 * поріг активації на наявних атрибутах, 0/1/кілька на бійця, жодного нового поля.
 * Таксономія — реальна тренерська термінологія з `docs/research/Q34_SIGNATURE_TRAITS.md`.
 */
export const DEFENSE_SIGNATURES = [
  'headMover', 'highGuard', 'shoulderRoll', 'angleCutter', 'clincher', 'pullCounter',
] as const;

export type DefenseSignature = (typeof DEFENSE_SIGNATURES)[number];

/**
 * Відносний поріг — до середнього серед п'яти оборонних атрибутів цього самого
 * бійця (`headMovement/blocking/footwork/defensiveDiscipline/anticipation`), які
 * вже разом дають `defence` у рушії. Виміряно на генерованому світі (4000 бійців,
 * разова перевірка): 90-й перцентиль відхилення від власного середнього — 0.06–0.08,
 * 97-й — ~0.10–0.13, тож ті самі `MARGIN`/`FLOOR`/`ELITE_FLOOR`, що й в атаці,
 * лишають прийом рідкісним, але живим: на тому ж світі кожен прийом має 2–4% бійців,
 * хоча б один — ~14%.
 */
export function defenseSignatures(attributes: Attributes): readonly DefenseSignature[] {
  const {
    headMovement, blocking, footwork, defensiveDiscipline, anticipation,
    counterPunching, clinching, ringIq, composure,
  } = attributes;
  const cluster = [headMovement, blocking, footwork, defensiveDiscipline, anticipation].map(a01);
  const avg = cluster.reduce((s, v) => s + v, 0) / cluster.length;

  const nhead = a01(headMovement); const nblock = a01(blocking); const nfoot = a01(footwork);

  const out: DefenseSignature[] = [];
  // Ухилення головою (bob & weave): рух голови — найсильніше в обороні бійця.
  if (nhead >= avg + MARGIN && nhead >= FLOOR) out.push('headMover');
  // Глухий блок (high guard / peekaboo): приймає на рукавички.
  if (nblock >= avg + MARGIN && nblock >= FLOOR) out.push('highGuard');
  // Підставка плеча: блок і голова разом вище середнього плюс контрудар вільною рукою.
  if (nblock >= avg + MARGIN / 2 && nhead >= avg + MARGIN / 2 && a01(counterPunching) >= FLOOR) {
    out.push('shoulderRoll');
  }
  // Різка кутів: ноги й розуміння рингу — виходить убік, а не назад на канати.
  if (nfoot >= avg + MARGIN && nfoot >= FLOOR && a01(ringIq) >= FLOOR) out.push('angleCutter');
  // Клінч як захист: клінч сильніший за решту його оборони — це його спосіб вижити,
  // а не просто один із високих атрибутів.
  const nclinch = a01(clinching);
  if (nclinch >= ELITE_FLOOR && nclinch >= avg + MARGIN && a01(ringIq) >= FLOOR) out.push('clincher');
  // Відхід із контратакою: відхиляється назад і б'є навздогін, не втрачаючи голови.
  if (nhead >= avg + MARGIN / 2 && a01(counterPunching) >= ELITE_FLOOR && a01(composure) >= ELITE_FLOOR) {
    out.push('pullCounter');
  }
  return out;
}
