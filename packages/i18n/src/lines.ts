import type { Translator } from './translate.js';

/**
 * Рядок, що прийшов із рушія чи зі світу: ключ перекладу і параметри, ніколи не текст
 * (ADR-0017). Тип описаний **структурно**, щоб `i18n` не залежав від `engine-fight`:
 * напрям залежностей (ADR-0002) забороняє такий імпорт.
 */
export interface LocalisableLine {
  key: string;
  params?: Record<string, string | number>;
  /** Параметри, значення яких самі є ключами перекладу: тип удару, позиція, місце розсічення. */
  keyParams?: Record<string, string>;
}

/**
 * Перетворює рядок на текст мовою користувача.
 *
 * `names` відображає непрозорі значення (сторону бійця `a`/`b`, id з новини) на імена.
 * Значення, якого немає в `names`, підставляється як є — так рядок ніколи не зникає
 * через невідомого бійця, а показує принаймні ідентифікатор.
 */
export function renderLine(
  translator: Translator, line: LocalisableLine, names: Record<string, string> = {},
): string {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(line.params ?? {})) {
    params[name] = typeof value === 'string' ? names[value] ?? value : value;
  }
  for (const [name, key] of Object.entries(line.keyParams ?? {})) {
    params[name] = translator.t(key);
  }
  return translator.t(line.key, params);
}
