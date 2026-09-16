import raw from './reference/sanctioning-bodies.json' with { type: 'json' };

/**
 * Чотири вигадані санкційні органи (ADR-0005: жодних реальних назв).
 * Ваги живуть тут, а не в коді (`AGENTS.md` §4) — саме вони роблять так,
 * що з однієї історії боїв органи дають різні топ-15 (ADR-0018).
 * Назви для показу — у `@bm/i18n` за ключем `body.<id>`.
 */
export interface SanctioningBody {
  id: string;
  characterKey: string;
  /** Наскільки карає простій. */
  activityWeight: number;
  /** Наскільки цінує рівень суперника. */
  qualityWeight: number;
  /** Наскільки повільно змінюється рейтинг: 0 — миттєво, 1 — майже не рухається. */
  inertia: number;
  /** Перевага бійцям свого регіону. */
  homeRegionBias: number;
  /** Вага популярності. Працює з фази 2, коли з'явиться сама популярність. */
  marketabilityWeight: number;
  /** Скільки місяців історії враховується. */
  windowMonths: number;
  /**
   * Скільки днів чемпіон має на обов'язковий захист (ADR-0026). Пропустив —
   * позбавляється пояса. Різний в кожного органу: це і є те, чим органи
   * відрізняються не лише формулою рейтингу.
   */
  mandatoryDefenseDays: number;
}

export const SANCTIONING_BODIES: readonly SanctioningBody[] = raw as SanctioningBody[];

export function bodyById(id: string): SanctioningBody {
  const found = SANCTIONING_BODIES.find((b) => b.id === id);
  if (!found) throw new Error(`Невідомий санкційний орган: ${id}`);
  return found;
}
