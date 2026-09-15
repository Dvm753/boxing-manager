import type { Fighter } from '@bm/core-model';
import type { FightMethod } from '@bm/engine-fight';

/** Рівень деталізації симуляції (ADR-0015). Похідна від стану, ніколи не зберігається. */
export type SimTier = 1 | 2 | 3;

export interface ScheduledFight {
  id: string;
  /** Номер дня, не дата: обчислення йдуть у днях (ADR-0016). */
  day: number;
  aId: string;
  bId: string;
  scheduledRounds: number;
}

export interface FightRecordEntry {
  fightId: string;
  day: number;
  opponentId: string;
  method: FightMethod;
  won: boolean | null;
  endingRound: number;
  /** Потрібен рейтингу: 12-раундовий бій вагоміший за 6-раундовий (ADR-0018). */
  scheduledRounds: number;
  tier: SimTier;
}

/**
 * Новина несе **ключ перекладу і параметри**, а не готовий рядок (ADR-0017):
 * світ не знає, якою мовою його читатимуть.
 */
export interface NewsItem {
  day: number;
  key: string;
  params: Record<string, string | number>;
}

/** Рейтинг — **похідна від історії** (ADR-0018), тому зберігається лише остання публікація. */
export interface RankingEntry {
  fighterId: string;
  position: number;
  score: number;
}

export interface World {
  day: number;
  seed: number;
  fighters: Record<string, Fighter>;
  schedule: readonly ScheduledFight[];
  history: Record<string, readonly FightRecordEntry[]>;
  /** Дні, до яких боєць недоступний — через відновлення після бою або травму. */
  unavailableUntil: Record<string, number>;
  playerFighterIds: readonly string[];
  news: readonly NewsItem[];
  /** Остання опублікована таблиця: `<bodyId>/<weightClassId>` → топ-15. */
  rankings: Record<string, readonly RankingEntry[]>;
  /** День останньої публікації рейтингів. */
  rankingsPublishedOn: number;
}

/** Нове значення форми бійця. Обидва поля 0–100 (ADR-0022). */
export interface ConditionChange {
  fighterId: string;
  sharpness: number;
  freshness: number;
}

export type WorldEvent =
  | { t: 'DayAdvanced'; day: number }
  | {
      t: 'FightCompleted'; fightId: string; day: number; aId: string; bId: string;
      method: FightMethod; winnerId: string | null; endingRound: number;
      scheduledRounds: number; tier: SimTier;
    }
  | { t: 'FighterRecordUpdated'; fighterId: string; day: number }
  | { t: 'FighterWearIncreased'; fighterId: string; rounds: number; headDelta: number }
  | { t: 'FighterInjured'; fighterId: string; daysOut: number }
  /**
   * Відновлення після будь-якого бою, не лише після травми. Боксер не виходить
   * у ринг щотижня: між боями табір і відпочинок (`WORLD_ENGINE_SPEC.md`).
   */
  | { t: 'FighterRecovering'; fighterId: string; daysOut: number }
  /**
   * Форма за день для всього світу (ADR-0022). Подія **пакетна** навмисно: окрема
   * подія на бійця означала б тисячі копій мапи бійців за один ігровий день.
   * Правило ADR-0016 «обробник змінює лише власний агрегат» від цього не порушується.
   */
  | { t: 'ConditionAdvanced'; day: number; changes: readonly ConditionChange[] }
  /** Провал форми після бою — окремо від зносу, бо знос незворотний, а форма ні. */
  | { t: 'FighterConditionDrained'; fighterId: string; rounds: number; headDelta: number }
  /** Відкриття табору перед призначеним боєм. Інформаційна подія для стайбла гравця. */
  | { t: 'FighterCampStarted'; fighterId: string; fightId: string; day: number }
  | { t: 'NewsCreated'; key: string; params: Record<string, string | number> }
  | { t: 'RankingsPublished'; day: number; bodyId: string };

export type WorldEventType = WorldEvent['t'];

export interface PlayerCommand {
  t: 'scheduleFight';
  fight: ScheduledFight;
}
