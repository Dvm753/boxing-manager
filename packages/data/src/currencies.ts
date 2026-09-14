import raw from './reference/currencies.json' with { type: 'json' };

/**
 * Курси **фіксовані й ігрові** (ADR-0019). Це не біржові котирування: у вигаданому світі
 * курс не плаває, інакше баланс гри залежав би від зовнішніх даних.
 * Базова одиниця моделі умовна; `rateFromBase` переводить її в обрану валюту.
 */
export interface Currency {
  id: string;
  symbol: string;
  rateFromBase: number;
  symbolPosition: 'before' | 'after';
}

export const CURRENCIES: readonly Currency[] = raw as Currency[];

export function currencyById(id: string): Currency {
  const found = CURRENCIES.find((c) => c.id === id);
  if (!found) throw new Error(`Невідома валюта: ${id}`);
  return found;
}
