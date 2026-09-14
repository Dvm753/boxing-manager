import { describe, it, expect } from 'vitest';
import { createRng, deriveSeed } from '../src/rng.js';

describe('Rng', () => {
  it('той самий seed дає ту саму послідовність', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('різні seed дають різні послідовності', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() лишається в [0, 1)', () => {
    const rng = createRng(777);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() не виходить за межі і покриває їх', () => {
    const rng = createRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('normalInt() тримається в межах і концентрується в центрі', () => {
    const rng = createRng(99);
    const values = Array.from({ length: 20_000 }, () => rng.normalInt(1, 20));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...values)).toBeLessThanOrEqual(20);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(11.5);
  });

  it('pick() кидає на порожньому масиві замість повернення undefined', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('deriveSeed() дає стабільні й різні потоки', () => {
    expect(deriveSeed(100, 'world/fighters')).toBe(deriveSeed(100, 'world/fighters'));
    expect(deriveSeed(100, 'world/fighters')).not.toBe(deriveSeed(100, 'world/gyms'));
  });
});
