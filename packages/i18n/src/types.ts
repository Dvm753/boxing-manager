export const LOCALES = ['uk', 'en', 'fr', 'de', 'es', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

/** Основна мова на час розробки і еталон набору ключів (ADR-0017). */
export const DEFAULT_LOCALE: Locale = 'uk';

export const LOCALE_NAMES: Record<Locale, string> = {
  uk: 'Українська', en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano',
};

export type Dictionary = Record<string, string>;
