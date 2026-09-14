/**
 * Чистий календар. `Date` і `Date.now()` заборонені в рушіях (ADR-0003): вони залежать
 * від середовища й часової зони, тож той самий seed давав би різні світи.
 *
 * Внутрішня одиниця часу — **номер дня** (ADR-0016 §квант часу). Перетворення день ↔ дата
 * робиться арифметикою за алгоритмом civil_from_days / days_from_civil.
 */
export interface CivilDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

/** Номер дня від 1970-01-01 (день 0). Від'ємні значення — до 1970. */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

/** ISO-рядок для показу і збережень. Не використовується в обчисленнях. */
export function formatIso(days: number): string {
  const { year, month, day } = civilFromDays(days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 0 — понеділок, 6 — неділя. 1970-01-01 був четвергом. */
export function weekday(days: number): number {
  return ((days + 3) % 7 + 7) % 7;
}
