import { describe, it, expect } from 'vitest';
import { ALL_ATTRIBUTES, type Attributes } from '../src/attributes.js';
import {
  attackSignatures, ATTACK_SIGNATURES, defenseSignatures, DEFENSE_SIGNATURES,
} from '../src/signature.js';

/**
 * Коронні прийоми атаки (Q34) — похідна від атрибутів, як `styleLabel` від осей.
 * Поріг відносний (до власного профілю бійця), тому тести фіксують правила
 * порогу, а не намагаються вгадати «правильний» баланс — той перевіряє
 * гейт ADR-0008 на реальних боях.
 */
const baseline = (over: Partial<Attributes> = {}): Attributes => {
  const attrs = {} as Attributes;
  for (const key of ALL_ATTRIBUTES) attrs[key] = 10;
  return { ...attrs, ...over };
};

describe('коронні прийоми атаки (Q34)', () => {
  it('рівний профіль без вираженої спеціалізації — жодного прийому', () => {
    expect(attackSignatures(baseline())).toEqual([]);
  });

  it('явно виражений джеб дає jabSpecialist', () => {
    const attrs = baseline({ jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8 });
    expect(attackSignatures(attrs)).toContain('jabSpecialist');
  });

  it('явно виражений хук дає hookSpecialist', () => {
    const attrs = baseline({ jab: 8, cross: 8, hook: 18, uppercut: 8, bodyPunching: 8 });
    expect(attackSignatures(attrs)).toContain('hookSpecialist');
  });

  it('апперкот без сили ближнього бою НЕ дає uppercutInside', () => {
    const attrs = baseline({ jab: 8, cross: 8, hook: 8, uppercut: 18, bodyPunching: 8, insideFighting: 8 });
    expect(attackSignatures(attrs)).not.toContain('uppercutInside');
  });

  it('апперкот разом із силою ближнього бою дає uppercutInside', () => {
    const attrs = baseline({ jab: 8, cross: 8, hook: 8, uppercut: 18, bodyPunching: 8, insideFighting: 18 });
    expect(attackSignatures(attrs)).toContain('uppercutInside');
  });

  it('комбінаційний боєць вимагає і combinations, і handSpeed одночасно', () => {
    const onlyCombos = baseline({ combinations: 18, handSpeed: 8 });
    const onlySpeed = baseline({ combinations: 8, handSpeed: 18 });
    const both = baseline({ combinations: 18, handSpeed: 18 });
    expect(attackSignatures(onlyCombos)).not.toContain('combinationPuncher');
    expect(attackSignatures(onlySpeed)).not.toContain('combinationPuncher');
    expect(attackSignatures(both)).toContain('combinationPuncher');
  });

  it('джеб і крос удвох вище середнього, хук і апперкот нижче — стандартна двійка', () => {
    const attrs = baseline({ jab: 14, cross: 14, hook: 6, uppercut: 6, bodyPunching: 10 });
    expect(attackSignatures(attrs)).toContain('onetwoSpecialist');
  });

  it('може бути декілька прийомів одночасно', () => {
    const attrs = baseline({
      jab: 18, cross: 8, hook: 8, uppercut: 18, bodyPunching: 8, insideFighting: 18,
    });
    const sigs = attackSignatures(attrs);
    expect(sigs).toContain('jabSpecialist');
    expect(sigs).toContain('uppercutInside');
    expect(sigs.length).toBeGreaterThanOrEqual(2);
  });

  it('елітний, рівномірно сильний профіль не отримує все підряд', () => {
    const attrs = baseline({ jab: 18, cross: 18, hook: 18, uppercut: 18, bodyPunching: 18 });
    // Усі удари однаково сильні — жоден не випереджає власне середнє.
    const sigs = attackSignatures(attrs).filter((s) => s !== 'combinationPuncher');
    expect(sigs).toEqual([]);
  });

  it('усі шість прийомів реально досяжні (не мертвий код через непоєднувані умови)', () => {
    const profiles: Attributes[] = [
      baseline({ jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8 }),
      baseline({ jab: 8, cross: 8, hook: 18, uppercut: 8, bodyPunching: 8 }),
      baseline({ jab: 8, cross: 8, hook: 8, uppercut: 18, bodyPunching: 8, insideFighting: 18 }),
      baseline({ jab: 8, cross: 8, hook: 8, uppercut: 8, bodyPunching: 18 }),
      baseline({ combinations: 18, handSpeed: 18 }),
      baseline({ jab: 14, cross: 14, hook: 6, uppercut: 6, bodyPunching: 10 }),
    ];
    const seen = new Set<string>();
    for (const attrs of profiles) for (const s of attackSignatures(attrs)) seen.add(s);
    for (const sig of ATTACK_SIGNATURES) expect(seen.has(sig), sig).toBe(true);
  });
});

describe('коронні прийоми оборони (Q34, друга частина)', () => {
  it('рівний профіль — жодного оборонного прийому', () => {
    expect(defenseSignatures(baseline())).toEqual([]);
  });

  it('рух головою, що випереджає решту оборони, дає headMover', () => {
    const attrs = baseline({ headMovement: 17, blocking: 9, footwork: 9, defensiveDiscipline: 9, anticipation: 9 });
    expect(defenseSignatures(attrs)).toContain('headMover');
  });

  it('блок, що випереджає решту оборони, дає highGuard', () => {
    const attrs = baseline({ headMovement: 9, blocking: 17, footwork: 9, defensiveDiscipline: 9, anticipation: 9 });
    expect(defenseSignatures(attrs)).toContain('highGuard');
  });

  it('підставка плеча вимагає і блок, і голову, і контрудар', () => {
    const noCounter = baseline({ headMovement: 14, blocking: 14, footwork: 8, defensiveDiscipline: 8, anticipation: 8, counterPunching: 5 });
    const withCounter = { ...noCounter, counterPunching: 14 };
    expect(defenseSignatures(noCounter)).not.toContain('shoulderRoll');
    expect(defenseSignatures(withCounter)).toContain('shoulderRoll');
  });

  it('різка кутів — ноги понад решту оборони і розуміння рингу', () => {
    const noIq = baseline({ footwork: 17, headMovement: 9, blocking: 9, defensiveDiscipline: 9, anticipation: 9, ringIq: 5 });
    expect(defenseSignatures(noIq)).not.toContain('angleCutter');
    expect(defenseSignatures({ ...noIq, ringIq: 12 })).toContain('angleCutter');
  });

  it('клінчер — клінч сильніший за решту його оборони, а не просто високий', () => {
    const allHigh = baseline({ clinching: 16, headMovement: 16, blocking: 16, footwork: 16, defensiveDiscipline: 16, anticipation: 16 });
    const clinchFirst = baseline({ clinching: 16, ringIq: 12 });
    expect(defenseSignatures(allHigh)).not.toContain('clincher');
    expect(defenseSignatures(clinchFirst)).toContain('clincher');
  });

  it('відхід із контратакою — голова, контрудар і холоднокровність разом', () => {
    const attrs = baseline({ headMovement: 13, counterPunching: 15, composure: 15 });
    expect(defenseSignatures(attrs)).toContain('pullCounter');
    expect(defenseSignatures({ ...attrs, composure: 8 })).not.toContain('pullCounter');
  });

  it('атака й оборона незалежні: можна мати обидва типи одночасно', () => {
    const attrs = baseline({ jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8, headMovement: 17 });
    expect(attackSignatures(attrs)).toContain('jabSpecialist');
    expect(defenseSignatures(attrs)).toContain('headMover');
  });

  it('усі шість оборонних прийомів досяжні', () => {
    const profiles: Attributes[] = [
      baseline({ headMovement: 17 }),
      baseline({ blocking: 17 }),
      baseline({ headMovement: 14, blocking: 14, footwork: 8, defensiveDiscipline: 8, anticipation: 8, counterPunching: 14 }),
      baseline({ footwork: 17, ringIq: 12 }),
      baseline({ clinching: 16, ringIq: 12 }),
      baseline({ headMovement: 13, counterPunching: 15, composure: 15 }),
    ];
    const seen = new Set<string>();
    for (const attrs of profiles) for (const s of defenseSignatures(attrs)) seen.add(s);
    for (const sig of DEFENSE_SIGNATURES) expect(seen.has(sig), sig).toBe(true);
  });
});
