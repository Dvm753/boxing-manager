import type { Fighter } from '@bm/core-model';
import type { CampFocus, CampLoad, CampPhase, FightPlanId } from '@bm/data';
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
  /**
   * Пояс, що на кону (ADR-0026): `<bodyId>/<weightClassId>`. Відсутній — звичайний бій.
   * Титульний бій завжди 12 раундів; це задає той, хто складає картку, не рушій.
   */
  titleKey?: string;
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

/**
 * Табір підопічного (ADR-0023). Існує **лише для бійців гравця**: решта світу тренується
 * за замовчуванням тренера, і зберігати для них порожню сутність було б марною вагою сейву.
 */
export interface CampPlanEntry {
  focus: CampFocus;
  load: CampLoad;
}

export interface Camp {
  fighterId: string;
  fightId: string;
  fightDay: number;
  /** Рішення гравця по фазах. Відсутня фаза означає «за замовчуванням тренера». */
  phases: Partial<Record<CampPhase, CampPlanEntry>>;
  /** План на бій (ADR-0014). Відсутній — боєць б'ється за своїми осями. */
  plan?: FightPlanId;
}

/**
 * Рішення в черзі (ADR-0020, ADR-0023). `deadline` — останній день, коли рішення ще можна
 * ухвалити; після нього пропозиція вважається відхиленою, а фаза табору йде за замовчуванням.
 * Гра не карає за пропущений екран — вона лише не чекає вічно.
 */
export type Decision =
  | {
      t: 'fightOffer'; id: string; fighterId: string; deadline: number;
      /** Бій цілком, щоб згода не перебудовувала його наново і не міняла сторони. */
      fight: ScheduledFight;
    }
  | {
      t: 'campPhase'; id: string; fighterId: string; deadline: number;
      fightId: string; phase: CampPhase;
    }
  | {
      t: 'fightPlan'; id: string; fighterId: string; deadline: number;
      fightId: string; opponentId: string;
    };

/**
 * Стан пояса (ADR-0026). **Не** похідна від історії, на відміну від рейтингу (ADR-0018):
 * позбавлення за пропущений захист і дата останнього завоювання — рішення органу,
 * а не наслідок, який можна перерахувати заново з самих боїв.
 */
export interface TitleState {
  /** `null` — вакантний. */
  championId: string | null;
  /** День, коли пояс завойовано (або звільнено, якщо вакантний). */
  since: number;
  /** Скільки разів захищено поспіль із моменту завоювання. */
  defences: number;
  /** Останній день, коли чемпіон зобов'язаний провести захист; `null` без чемпіона немає сенсу. */
  mandatoryDueBy: number | null;
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
  /** Табори підопічних (ADR-0023). Для бійців ШІ таборів немає — вони тренуються за замовчуванням. */
  camps: readonly Camp[];
  /** Черга рішень гравця з дедлайнами (ADR-0020). */
  decisions: readonly Decision[];
  /**
   * Пояси (ADR-0026), ключ той самий, що й у `rankings`: `<bodyId>/<weightClassId>`.
   * Відсутній ключ означає вакантний пояс, який ще ніхто не запитував — семантично
   * те саме, що явний запис із `championId: null`; записи створюються лінькво,
   * так само як таблиці рейтингів.
   */
  titles: Record<string, TitleState>;
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
      /** Пояс на кону, якщо бій титульний (ADR-0026); з `ScheduledFight.titleKey`. */
      titleKey?: string;
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
  /** Пропозиція бою підопічному: у календар вона потрапить лише після згоди. */
  | { t: 'FightOffered'; fighterId: string; fightId: string; day: number; deadline: number }
  | { t: 'OfferAccepted'; fighterId: string; fightId: string }
  | { t: 'OfferDeclined'; fighterId: string; fightId: string; expired: boolean }
  /** Рішення по фазі табору: ухвалене гравцем або залишене тренеру. */
  | {
      t: 'CampPhaseSet'; fighterId: string; fightId: string; phase: CampPhase;
      focus: CampFocus; load: CampLoad; byCoach: boolean;
    }
  | {
      t: 'FightPlanSet'; fighterId: string; fightId: string;
      plan: FightPlanId; byCoach: boolean;
    }
  | { t: 'CampInjury'; fighterId: string; daysOut: number }
  /** Бій знято з календаря: травма в таборі накрила його дату. */
  | { t: 'FightWithdrawn'; fightId: string; fighterId: string; reason: 'injury' }
  | { t: 'NewsCreated'; key: string; params: Record<string, string | number> }
  | { t: 'RankingsPublished'; day: number; bodyId: string }
  /**
   * Пояс здобуто (ADR-0026): або заповнено вакансію (`vacant: true`), або скинуто
   * чемпіона (`vacant: false`). Нічия в титульному бою сюди не потрапляє — пояс
   * лишається на місці, це `TitleDefended` або взагалі нічого, якщо був вакантним.
   */
  | { t: 'TitleWon'; titleKey: string; championId: string; day: number; vacant: boolean }
  /** Успішний захист, включно з нічиєю — нічия в боксі лишає пояс чемпіону. */
  | { t: 'TitleDefended'; titleKey: string; championId: string; day: number; defences: number }
  /** Чемпіон не провів обов'язковий захист вчасно — пояс стає вакантним. */
  | { t: 'TitleVacated'; titleKey: string; formerChampionId: string; day: number };

export type WorldEventType = WorldEvent['t'];

/**
 * Команди, що надходять у тік дня. `scheduleFight` подає промоутер (у прогоні — пакет `ai`);
 * якщо бій стосується підопічного, світ **не ставить його в календар**, а створює пропозицію:
 * бій за участю бійця гравця не може бути призначений без згоди гравця (ADR-0023).
 */
export type PlayerCommand =
  | { t: 'scheduleFight'; fight: ScheduledFight }
  | { t: 'acceptOffer'; decisionId: string }
  | { t: 'declineOffer'; decisionId: string }
  | { t: 'setCampPhase'; decisionId: string; focus: CampFocus; load: CampLoad }
  | { t: 'setFightPlan'; decisionId: string; plan: FightPlanId };
