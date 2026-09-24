import { describe, it, expect } from 'vitest';
import type { Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  agingEvents, birthdayOf, developedAbility, developmentEvents, dispatch, hiddenCeilingOf,
  peakAgeOf, HANDLERS, civilFromDays, daysFromCivil, type World, type WorldEvent,
} from '../src/index.js';

/**
 * Розвиток і старіння (ADR-0031) — модуль сам по собі. Підключення до `advanceDay`
 * чекає на рішення власника щодо двох наявних тестів, тож тут механізм перевіряється
 * напряму: день за днем через ті самі події й обробник, що використав би світ.
 */
function worldOf(count: number, seed = 7): World {
  const fighters: Record<string, Fighter> = {};
  for (const f of generateWorld(seed, count).fighters) fighters[f.id] = f;
  return {
    day: daysFromCivil({ year: 2026, month: 1, day: 5 }), seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [], titles: {},
  };
}

/** N днів лише віку й розвитку — без боїв і форми, щоб бачити саме механізм. */
function live(world: World, days: number): World {
  let current = world;
  for (let d = 0; d < days; d++) {
    const day = current.day + 1;
    current = { ...current, day };
    const events: WorldEvent[] = [...agingEvents(current, day), ...developmentEvents(current, day)];
    current = dispatch(current, events, HANDLERS).world;
  }
  return current;
}

const base = worldOf(300);
const year = live(base, 365);

describe('розвиток і старіння (ADR-0031)', () => {
  it('за рік кожному бійцю виповнюється рівно один рік', () => {
    for (const f of Object.values(base.fighters)) {
      expect((year.fighters[f.id] as Fighter).age).toBe(f.age + 1);
    }
  });

  it('день народження — стабільна дата, похідна від id', () => {
    const id = Object.keys(base.fighters)[0] as string;
    expect(birthdayOf(id)).toEqual(birthdayOf(id));
    const b = birthdayOf(id);
    expect(b.month).toBeGreaterThanOrEqual(1);
    expect(b.month).toBeLessThanOrEqual(12);
    expect(b.day).toBeGreaterThanOrEqual(1);
    expect(b.day).toBeLessThanOrEqual(28);
    // День народження справді настає в календарі.
    expect(civilFromDays(daysFromCivil({ year: 2027, month: b.month, day: b.day })).day).toBe(b.day);
  });

  it('крок завжди ±1 на атрибут за тік, межі 1–20 не порушуються', () => {
    let current = base;
    for (let d = 0; d < 120; d++) {
      const day = current.day + 1;
      current = { ...current, day };
      for (const e of developmentEvents(current, day)) {
        if (e.t !== 'FighterDeveloped') continue;
        for (const delta of Object.values(e.changes)) expect(Math.abs(delta)).toBe(1);
      }
      current = dispatch(current, [...agingEvents(current, day), ...developmentEvents(current, day)], HANDLERS).world;
    }
    for (const f of Object.values(current.fighters)) {
      for (const v of Object.values(f.attributes)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
    }
  });

  it('молоді нижче стелі ростуть, ветерани після піку спадають', () => {
    const young = Object.values(base.fighters).filter((f) =>
      f.age <= 22 && developedAbility(f.attributes) < hiddenCeilingOf(f) - 1);
    const old = Object.values(base.fighters).filter((f) => f.age >= peakAgeOf(f) + 4);
    expect(young.length).toBeGreaterThan(5);
    expect(old.length).toBeGreaterThan(5);
    const gain = (f: Fighter): number =>
      developedAbility((year.fighters[f.id] as Fighter).attributes) - developedAbility(f.attributes);
    const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(young.map(gain))).toBeGreaterThan(0);
    expect(avg(old.map(gain))).toBeLessThan(0);
  });

  it('ріст зупиняється на прихованій стелі й не виходить за верх потенціалу', () => {
    const decade = live(base, 365 * 6);
    for (const f of Object.values(decade.fighters)) {
      const start = base.fighters[f.id] as Fighter;
      // Ріст іде ±1 за тік і зупиняється, щойно середнє досягло стелі — переліт не більше кроку.
      if (developedAbility(f.attributes) > developedAbility(start.attributes)) {
        expect(developedAbility(f.attributes)).toBeLessThanOrEqual(f.potentialRange[1] + 0.5);
      }
    }
  });

  it('детермінізм: той самий світ і дні дають ті самі атрибути', () => {
    expect(JSON.stringify(live(base, 60).fighters)).toBe(JSON.stringify(live(base, 60).fighters));
  });

  it('приховані атрибути характеру не змінюються', () => {
    for (const f of Object.values(base.fighters)) {
      const after = year.fighters[f.id] as Fighter;
      expect(after.attributes.injuryProneness).toBe(f.attributes.injuryProneness);
      expect(after.attributes.dirtiness).toBe(f.attributes.dirtiness);
      expect(after.attributes.professionalism).toBe(f.attributes.professionalism);
    }
  });

  it('за 12 тижнів картина як у FM: у молодих +1…+3 на окремих атрибутах', () => {
    const quarter = live(base, 84);
    const young = Object.values(base.fighters).filter((f) =>
      f.age <= 21 && developedAbility(f.attributes) < hiddenCeilingOf(f) - 1);
    let maxDelta = 0;
    let changed = 0;
    for (const f of young) {
      const after = quarter.fighters[f.id] as Fighter;
      for (const [k, v] of Object.entries(after.attributes)) {
        const d = v - (f.attributes as unknown as Record<string, number>)[k]!;
        if (d !== 0) changed++;
        maxDelta = Math.max(maxDelta, Math.abs(d));
      }
    }
    expect(changed).toBeGreaterThan(young.length);
    expect(maxDelta).toBeLessThanOrEqual(4);
  });
});
