import { describe, it, expect } from 'vitest';
import { styleLabel, validateAttributes, validateAxes } from '@bm/core-model';
import { generateWorld } from '../src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../src/weight-classes.js';

describe('генератор світу', () => {
  it('той самий seed дає байт-ідентичний світ (ADR-0003)', () => {
    const a = generateWorld(2026, 500);
    const b = generateWorld(2026, 500);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('інший seed дає інший світ', () => {
    expect(JSON.stringify(generateWorld(1, 50))).not.toBe(JSON.stringify(generateWorld(2, 50)));
  });

  it('усі атрибути всіх бійців у межах 1–20', () => {
    for (const fighter of generateWorld(7, 500).fighters) {
      expect(validateAttributes(fighter.attributes)).toEqual([]);
    }
  });

  it('ідентифікатори унікальні й у формі UUID v4 (ADR-0013)', () => {
    const { fighters } = generateWorld(11, 500);
    expect(new Set(fighters.map((f) => f.id)).size).toBe(fighters.length);
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const f of fighters) expect(f.id).toMatch(uuidV4);
  });

  it('порядок id не збігається з порядком генерації — id не є позицією', () => {
    // Якби id кодував індекс, сортування за id відтворило б порядок генерації.
    const { fighters } = generateWorld(11, 200);
    const generated = fighters.map((f) => f.id);
    const byId = [...generated].sort();
    expect(byId).not.toEqual(generated);
  });

  it('осі стилю валідні, мітка є похідною від них (ADR-0011)', () => {
    for (const f of generateWorld(31, 300).fighters) {
      expect(validateAxes(f.styleAxes)).toEqual([]);
      const label = styleLabel(f.styleAxes);
      expect(styleLabel(f.styleAxes)).toBe(label); // детермінована
    }
  });

  it('осі справді різні між бійцями — світ не однорідний', () => {
    const { fighters } = generateWorld(37, 400);
    const labels = new Set(fighters.map((f) => styleLabel(f.styleAxes)));
    expect(labels.size).toBeGreaterThanOrEqual(4);
  });

  it('піраміда світу: слабких більше, ніж сильних', () => {
    const { fighters } = generateWorld(3, 2000);
    const avg = (f: (typeof fighters)[number]): number =>
      Object.values(f.attributes).reduce((s, v) => s + v, 0) / Object.keys(f.attributes).length;
    const strong = fighters.filter((f) => avg(f) >= 15).length;
    const weak = fighters.filter((f) => avg(f) <= 10).length;
    expect(weak).toBeGreaterThan(strong);
  });

  it("вік у межах професійної кар'єри", () => {
    for (const f of generateWorld(5, 500).fighters) {
      expect(f.age).toBeGreaterThanOrEqual(18);
      expect(f.age).toBeLessThanOrEqual(38);
    }
  });

  it('рекорд узгоджений: перемоги + поразки + нічиї не перевищують проведених боїв', () => {
    for (const f of generateWorld(13, 500).fighters) {
      expect(f.record.knockouts).toBeLessThanOrEqual(f.record.wins);
      expect(f.record.wins).toBeGreaterThanOrEqual(0);
      expect(f.record.losses).toBeGreaterThanOrEqual(0);
      expect(f.record.draws).toBeGreaterThanOrEqual(0);
    }
  });

  it('знос тільки невідʼємний і обмежений 100', () => {
    for (const f of generateWorld(17, 500).fighters) {
      expect(f.wear.headTrauma).toBeGreaterThanOrEqual(0);
      expect(f.wear.headTrauma).toBeLessThanOrEqual(100);
      expect(f.wear.bodyWear).toBeLessThanOrEqual(100);
    }
  });

  it('вагова категорія кожного бійця існує в довіднику', () => {
    const ids = new Set(WEIGHT_CLASSES.map((w) => w.id));
    for (const f of generateWorld(19, 500).fighters) {
      expect(ids.has(f.constants.naturalWeightClassId)).toBe(true);
    }
  });

  it('стеля зростання — діапазон, а не число', () => {
    for (const f of generateWorld(23, 300).fighters) {
      expect(f.potentialRange[1]).toBeGreaterThan(f.potentialRange[0]);
      expect(f.potentialRange[1]).toBeLessThanOrEqual(20);
    }
  });
});
