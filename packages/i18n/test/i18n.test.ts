import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator, DICTIONARIES, LOCALES, MissingTranslationError, DEFAULT_LOCALE } from '../src/index.js';

describe('словники (ADR-0017)', () => {
  it('усі мови мають однаковий набір ключів', () => {
    const reference = Object.keys(DICTIONARIES[DEFAULT_LOCALE]).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort(), `мова ${locale}`).toEqual(reference);
    }
  });

  it('жодне значення не порожнє', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        expect(value.trim(), `${locale}/${key}`).not.toBe('');
      }
    }
  });

  it('усі мови, крім української, справді перекладені', () => {
    // Збіг із українською допустимий лише для назв, які не перекладаються.
    const allowed = new Set(['app.title', 'ui.seed', 'ui.knockdownsShort', 'ui.cm', 'attribute.jab', 'attribute.timing']);
    for (const locale of LOCALES.filter((l) => l !== 'uk')) {
      const same = Object.keys(DICTIONARIES.uk).filter(
        (k) => DICTIONARIES[locale][k] === DICTIONARIES.uk[k] && !allowed.has(k),
      );
      expect(same, `мова ${locale}: неперекладені ключі`).toEqual([]);
    }
  });
});

describe('перекладач', () => {
  it('підставляє параметри', () => {
    const t = createTranslator('uk');
    expect(t.t('ui.endingRound')).toBe('раунд завершення');
  });

  it('множина української має три форми', () => {
    const t = createTranslator('uk');
    expect(t.plural('plural.fights', 1)).toBe('1 бій');
    expect(t.plural('plural.fights', 3)).toBe('3 бої');
    expect(t.plural('plural.fights', 7)).toBe('7 боїв');
    expect(t.plural('plural.fights', 21)).toBe('21 бій');
  });

  it('множина англійської має дві форми', () => {
    const t = createTranslator('en');
    expect(t.plural('plural.fights', 1)).toBe('1 fight');
    expect(t.plural('plural.fights', 5)).toBe('5 fights');
  });

  it('відсутній ключ не відкочується мовчки на іншу мову', () => {
    const dev = createTranslator('fr');
    expect(dev.t('немає.такого.ключа')).toBe('немає.такого.ключа');
    const strict = createTranslator('fr', { onMissing: 'throw' });
    expect(() => strict.t('немає.такого.ключа')).toThrow(MissingTranslationError);
  });
});

describe('симуляція не містить тексту для людини (ADR-0017)', () => {
  const GUARDED = ['core-model', 'data', 'ai', 'engine-fight', 'engine-world'];

  it('у даних і рушіях немає полів з назвами для показу', () => {
    const offenders: string[] = [];
    const walk = (dir: string): string[] => {
      let out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out = out.concat(walk(full));
        else if (/\.(ts|json)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    for (const pkg of GUARDED) {
      let files: string[];
      try { files = walk(join(process.cwd(), 'packages', pkg, 'src')); } catch { continue; }
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        if (/"(name|label|description|title)(Uk|En|Fr|De|Es|It)"\s*:/.test(text)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
