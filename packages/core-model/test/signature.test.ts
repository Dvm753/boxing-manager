import { describe, it, expect } from 'vitest';
import { ALL_ATTRIBUTES, type Attributes } from '../src/attributes.js';
import { attackSignatures, ATTACK_SIGNATURES } from '../src/signature.js';

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
