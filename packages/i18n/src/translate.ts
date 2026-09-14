import { DEFAULT_LOCALE, type Dictionary, type Locale } from './types.js';
import uk from './locales/uk.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };

export const DICTIONARIES: Record<Locale, Dictionary> = { uk, en, fr, de, es, it };

/**
 * Порядок форм множини в словнику. Задано явно, бо `Intl.PluralRules` не гарантує
 * порядку в `resolvedOptions().pluralCategories`, а від нього залежить, яка форма береться.
 */
const PLURAL_ORDER: Record<Locale, readonly Intl.LDMLPluralRule[]> = {
  uk: ['one', 'few', 'many'],
  en: ['one', 'other'],
  fr: ['one', 'other'],
  de: ['one', 'other'],
  es: ['one', 'other'],
  it: ['one', 'other'],
};

export interface Translator {
  locale: Locale;
  /** Повертає рядок за ключем; `{name}` у шаблоні замінюється значенням із `params`. */
  t(key: string, params?: Record<string, string | number>): string;
  /** Форма множини: `plural.fights` із `n` обирає потрібну форму мови. */
  plural(key: string, n: number): string;
}

export class MissingTranslationError extends Error {
  constructor(key: string, locale: Locale) {
    super(`Немає перекладу «${key}» для мови ${locale}`);
    this.name = 'MissingTranslationError';
  }
}

export interface TranslatorOptions {
  /**
   * Що робити з відсутнім ключем. `throw` — у тестах, `key` — у розробці.
   * Мовчазного відкату на іншу мову немає навмисно: він ховає прогалини до релізу (ADR-0017).
   */
  onMissing?: 'throw' | 'key';
}

export function createTranslator(locale: Locale, options: TranslatorOptions = {}): Translator {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const onMissing = options.onMissing ?? 'key';

  const lookup = (key: string): string | undefined => dict[key];

  const fill = (template: string, params?: Record<string, string | number>): string =>
    params
      ? template.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in params ? String(params[name]) : whole)
      : template;

  return {
    locale,
    t(key, params) {
      const value = lookup(key);
      if (value === undefined) {
        if (onMissing === 'throw') throw new MissingTranslationError(key, locale);
        return key;
      }
      return fill(value, params);
    },
    plural(key, n) {
      const value = lookup(key);
      if (value === undefined) {
        if (onMissing === 'throw') throw new MissingTranslationError(key, locale);
        return key;
      }
      const forms = value.split('|').map((f) => f.trim());
      const order = PLURAL_ORDER[locale];
      const category = new Intl.PluralRules(locale).select(n);
      const index = order.indexOf(category);
      const form = forms[index >= 0 && index < forms.length ? index : forms.length - 1] as string;
      return fill(form, { n });
    },
  };
}
