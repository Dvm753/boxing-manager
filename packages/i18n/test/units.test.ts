import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cmToFeetInches, cmToInches, formatLength, formatMoney, formatWeight,
  inchesToCm, kgToPounds, poundsToKg, listCurrencies, type DisplaySettings,
} from '../src/units.js';

const base: DisplaySettings = { locale: 'uk', units: 'metric', currency: 'USD', theme: 'dark' };

describe('перетворення одиниць (ADR-0019)', () => {
  it('туди-назад повертає вихідне значення', () => {
    for (const cm of [150, 165.5, 180, 201]) {
      expect(inchesToCm(cmToInches(cm))).toBeCloseTo(cm, 9);
    }
    for (const kg of [47.63, 61.23, 90.72, 118]) {
      expect(poundsToKg(kgToPounds(kg))).toBeCloseTo(kg, 9);
    }
  });

  it('відомі відповідності', () => {
    expect(cmToInches(2.54)).toBeCloseTo(1, 9);
    expect(kgToPounds(1)).toBeCloseTo(2.2046226, 6);
    // Ліміт напівсередньої ваги — 147 фунтів.
    expect(kgToPounds(66.68)).toBeCloseTo(147, 1);
  });

  it('12 дюймів переносяться у фут, а не лишаються як 5′12″', () => {
    const { feet, inches } = cmToFeetInches(182.88); // рівно 6 футів
    expect(feet).toBe(6);
    expect(inches).toBe(0);
    for (const cm of Array.from({ length: 80 }, (_, i) => 140 + i)) {
      expect(cmToFeetInches(cm).inches).toBeLessThan(12);
    }
  });

  it('форматування довжини залежить від системи', () => {
    expect(formatLength(170, base, 'см')).toBe('170 см');
    expect(formatLength(170, { ...base, units: 'imperial' }, 'см')).toBe('5′7″');
  });

  it('форматування ваги залежить від системи', () => {
    expect(formatWeight(66.68, base, 'кг', 'фн')).toBe('66.7 кг');
    expect(formatWeight(66.68, { ...base, units: 'imperial' }, 'кг', 'фн')).toBe('147.0 фн');
  });
});

describe('валюта', () => {
  it('символ і позиція залежать від валюти', () => {
    expect(formatMoney(420000, base)).toBe('$420 000');
    expect(formatMoney(420000, { ...base, currency: 'EUR' })).toBe('386 400 €');
    expect(formatMoney(420000, { ...base, currency: 'GBP' })).toBe('£331 800');
  });

  it('усі валюти з довідника форматуються', () => {
    for (const id of listCurrencies()) {
      expect(formatMoney(1000, { ...base, currency: id })).toMatch(/\d/);
    }
  });

  it('невідома валюта падає, а не мовчить', () => {
    expect(() => formatMoney(1, { ...base, currency: 'XYZ' })).toThrow();
  });
});

describe('одиниці не проникають у симуляцію (ADR-0019)', () => {
  const GUARDED = ['core-model', 'data', 'ai', 'engine-fight', 'engine-world'];

  it('у рушіях і даних немає дюймів, фунтів і символів валют', () => {
    const offenders: string[] = [];
    const walk = (dir: string): string[] => {
      let out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out = out.concat(walk(full));
        else if (/\.ts$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    for (const pkg of GUARDED) {
      let files: string[];
      try { files = walk(join(process.cwd(), 'packages', pkg, 'src')); } catch { continue; }
      for (const file of files) {
        // `currencies.ts` — довідник валют, символи там за призначенням.
        if (file.endsWith('currencies.ts')) continue;
        const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        // `$` перевіряється лише поруч із числом: у шаблонних рядках `${...}` він не є валютою.
        if (/[€£]|\$\s*[\d{'"`]?\d|\bpounds?\b|\binche?s?\b|\bfeet\b/i.test(code)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
