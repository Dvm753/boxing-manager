import { describe, it, expect } from 'vitest';
import { runCalibration } from '../src/calibrate.js';

/**
 * ГЕЙТ ФАЗИ 0 (ADR-0009). Коридори — ADR-0008.
 *
 * `AGENTS.md` §5: якщо зміна ламає ці розподіли, відхиляється **зміна**, а не тест.
 * Розширити коридор, щоб тест пройшов, заборонено — коридори походять із виміряних даних
 * (`docs/research/Q1_PACKAGE_AUDIT.md`), а не з поведінки коду.
 */
const CORRIDORS = {
  light: { early: [40, 55] },
  middle: { early: [42, 58] },
  heavy: { early: [48, 65] },
} as const;

const DRAW = [2.0, 4.0] as const;
const SPLIT = [22, 31] as const;

const FIGHTS = 2500;
const reports = runCalibration(2026, FIGHTS);
const byGroup = Object.fromEntries(reports.map((r) => [r.group, r]));

describe('golden-тести калібрування — гейт фази 0', () => {
  for (const group of ['light', 'middle', 'heavy'] as const) {
    it(`M1 дострокові завершення, ${group}`, () => {
      const r = byGroup[group]!;
      const [lo, hi] = CORRIDORS[group].early;
      expect(r.earlyPct).toBeGreaterThanOrEqual(lo);
      expect(r.earlyPct).toBeLessThanOrEqual(hi);
    });

    it(`M3 частка нічиїх, ${group}`, () => {
      const r = byGroup[group]!;
      expect(r.drawPct).toBeGreaterThanOrEqual(DRAW[0]);
      expect(r.drawPct).toBeLessThanOrEqual(DRAW[1]);
    });

    it(`M4 роздільні й неодностайні рішення, ${group}`, () => {
      const r = byGroup[group]!;
      expect(r.splitPct).toBeGreaterThanOrEqual(SPLIT[0]);
      expect(r.splitPct).toBeLessThanOrEqual(SPLIT[1]);
    });
  }

  it('важка вага зупиняється частіше за легку, інтервали не перетинаються', () => {
    const light = byGroup['light']!;
    const heavy = byGroup['heavy']!;
    expect(heavy.earlyPct - heavy.earlyCi).toBeGreaterThan(light.earlyPct + light.earlyCi);
  });

  it('вибірка достатня для заявленої точності', () => {
    for (const r of reports) {
      expect(r.n).toBe(FIGHTS);
      expect(r.earlyCi).toBeLessThan(3.0);
    }
  });
});
