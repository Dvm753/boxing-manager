import type { Fighter, Rng } from '@bm/core-model';

/**
 * `ai` **не імпортує `engine-world`** — інакше залежність стала б круговою
 * (ADR-0002: `engine-world` → `ai` → `data` → `core-model`).
 * Тому все, що потрібно з боку світу, приходить сюди простими структурами.
 */
export interface RankedPosition {
  /** 1–15, або `null` якщо боєць поза таблицею. */
  position: number | null;
  bodyId: string;
}

export interface MatchCandidate {
  fighter: Fighter;
  /**
   * Середня майстерність і найкраща позиція **обчислюються один раз** при складанні кандидата.
   * Матчмейкінг робить сотні тисяч оцінок за сезон; рахувати їх у самій оцінці означало б
   * читати 47 атрибутів щоразу — це вже сповільнювало тік дня в `buildTierIndex`.
   */
  ability: number;
  /** Найкраща (найменша) позиція серед усіх органів; 30 — умовне «поза таблицею». */
  bestPosition: number;
  /** Позиції в рейтингах усіх органів. */
  rankings: readonly RankedPosition[];
  /** Номер дня останнього бою; `null` — не бився. */
  lastFightDay: number | null;
  /**
   * Скільки днів боєць існує у світі. Потрібен для надбавки за простій (ADR-0024):
   * дебютант без жодного бою теж має шукати бій, а не чекати вічно.
   */
  daysSinceStart: number;
  /** Чи доступний зараз (не травмований). */
  available: boolean;
}

export interface MatchmakingContext {
  day: number;
  rng: Rng;
}

/** Оцінка пропозиції з боку одного бійця. Симетрична: бій відбувається, якщо згодні обидва. */
export interface OfferAssessment {
  /** Ймовірність перемоги за оцінкою менеджера, 0–1. */
  winChance: number;
  /** Приріст рейтингу при перемозі, умовні одиниці. */
  reward: number;
  /** Втрата при поразці. */
  risk: number;
  /** Тиск простою: чим довше без бою, тим охочіше погоджується. */
  inactivityPressure: number;
  /** Надбавка «шукає бій сам» (ADR-0024); 0, поки боєць у нормальному ритмі. */
  seeking: number;
  /** Підсумкова привабливість. Додатна — згоден. */
  score: number;
  accept: boolean;
}

export interface ProposedBout {
  aId: string;
  bId: string;
  /** Середня привабливість для обох — використовується для впорядкування картки. */
  appeal: number;
}
