import { CURRENCIES, currencyById } from '@bm/data';
import type { Locale } from './types.js';

/**
 * Перетворення і форматування одиниць (ADR-0019).
 *
 * Модель зберігає тільки базові одиниці: сантиметри, кілограми, умовні гроші.
 * Усе, що нижче, — **виключно подання**. Рушії про одиниці не знають, тому перемикання
 * системи мір не може вплинути на симуляцію.
 */
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export interface DisplaySettings {
  locale: Locale;
  units: UnitSystem;
  currency: string;
  theme: Theme;
}

const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;

export const cmToInches = (cm: number): number => cm / CM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const kgToPounds = (kg: number): number => kg / KG_PER_POUND;
export const poundsToKg = (pounds: number): number => pounds * KG_PER_POUND;

export interface FeetInches {
  feet: number;
  inches: number;
}

/** Округлення до цілого дюйма — так подає бокс. 12 дюймів переносяться у фут. */
export function cmToFeetInches(cm: number): FeetInches {
  const totalInches = Math.round(cmToInches(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/**
 * Довжина в обраній системі. `t` потрібен для скорочення «см» — воно різне мовами,
 * тоді як `′` і `″` універсальні.
 */
export function formatLength(cm: number, settings: DisplaySettings, cmLabel: string): string {
  if (settings.units === 'metric') return `${Math.round(cm)} ${cmLabel}`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″`;
}

export function formatWeight(kg: number, settings: DisplaySettings, kgLabel: string, lbLabel: string): string {
  if (settings.units === 'metric') return `${kg.toFixed(1)} ${kgLabel}`;
  return `${kgToPounds(kg).toFixed(1)} ${lbLabel}`;
}

/** Гроші: базова одиниця моделі → обрана валюта за фіксованим ігровим курсом. */
export function formatMoney(baseAmount: number, settings: DisplaySettings): string {
  const currency = currencyById(settings.currency);
  const value = baseAmount * currency.rateFromBase;
  const rounded = Math.round(value);
  // Пробіл-нерозривний як роздільник тисяч: однаково читається в усіх шести мовах
  // і не залежить від того, що Intl вважає правильним у конкретній локалі.
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency.symbolPosition === 'before'
    ? `${currency.symbol}${grouped}`
    : `${grouped} ${currency.symbol}`;
}

export const listCurrencies = (): readonly string[] => CURRENCIES.map((c) => c.id);
