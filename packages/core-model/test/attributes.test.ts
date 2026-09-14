import { describe, it, expect } from 'vitest';
import { ALL_ATTRIBUTES, isValidAttribute, normalize, validateAttributes, type Attributes } from '../src/attributes.js';

const build = (value: number): Attributes =>
  Object.fromEntries(ALL_ATTRIBUTES.map((k) => [k, value])) as Attributes;

describe('атрибути: шкала 1–20 (ADR-0006)', () => {
  it('приймає цілі 1–20', () => {
    for (let v = 1; v <= 20; v++) expect(isValidAttribute(v)).toBe(true);
  });

  it('відхиляє 0, 21 і дробові', () => {
    for (const v of [0, 21, -3, 10.5, NaN]) expect(isValidAttribute(v)).toBe(false);
  });

  it('валідний набір не дає порушень', () => {
    expect(validateAttributes(build(12))).toEqual([]);
  });

  it('порушення називає конкретний атрибут', () => {
    const bad = build(12);
    bad.jab = 25;
    const problems = validateAttributes(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('jab');
  });

  it('нормалізація дає рівно [0, 1] на межах', () => {
    expect(normalize(1)).toBe(0);
    expect(normalize(20)).toBe(1);
  });

  it('усі 43 атрибути унікальні', () => {
    expect(new Set(ALL_ATTRIBUTES).size).toBe(ALL_ATTRIBUTES.length);
    expect(ALL_ATTRIBUTES.length).toBe(43);
  });
});
