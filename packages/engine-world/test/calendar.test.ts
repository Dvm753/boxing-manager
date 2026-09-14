import { describe, it, expect } from 'vitest';
import { civilFromDays, daysFromCivil, formatIso, weekday } from '../src/calendar.js';

describe('чистий календар (ADR-0003: без Date)', () => {
  it('день 0 — 1970-01-01', () => {
    expect(civilFromDays(0)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
  });

  it('перетворення оборотне на 80 роках', () => {
    for (let d = -20000; d < 20000; d += 7) {
      expect(daysFromCivil(civilFromDays(d))).toBe(d);
    }
  });

  it('високосні роки', () => {
    expect(formatIso(daysFromCivil({ year: 2024, month: 2, day: 28 }) + 1)).toBe('2024-02-29');
    expect(formatIso(daysFromCivil({ year: 2023, month: 2, day: 28 }) + 1)).toBe('2023-03-01');
    // 1900 не високосний, 2000 високосний
    expect(formatIso(daysFromCivil({ year: 1900, month: 2, day: 28 }) + 1)).toBe('1900-03-01');
    expect(formatIso(daysFromCivil({ year: 2000, month: 2, day: 28 }) + 1)).toBe('2000-02-29');
  });

  it('збігається зі стандартним Date (перевірка ззовні рушія)', () => {
    for (const iso of ['1970-01-01', '1999-12-31', '2026-09-14', '2100-03-01']) {
      const expected = Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
      expect(daysFromCivil({ year: y, month: m, day: d }), iso).toBe(expected);
    }
  });

  it('1970-01-01 — четвер', () => {
    expect(weekday(0)).toBe(3);
  });
});
