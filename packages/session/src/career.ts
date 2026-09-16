import type { Fighter } from '@bm/core-model';
import { generateWorld, CONDITION_TUNING } from '@bm/data';
import {
  campEntryFor, rankingKey, sharpnessCeiling,
  type Camp, type Decision, type FightRecordEntry, type World,
} from '@bm/engine-world';
import { campPhaseFor, type CampPhase } from '@bm/data';
import { SANCTIONING_BODIES } from '@bm/data';

/**
 * Життєвий цикл кар'єри: створення світу і стайбл гравця.
 *
 * Тут **немає жодного рішення гравця, крім вибору бійця** — решта (пропозиції боїв, табір,
 * план на бій) чекає на ADR-0023. Цей шар свідомо лише спостережний: він показує, що
 * `playerFighterIds` нарешті не порожній і що світ уміє віддати стан «мого» бійця.
 */

/** День відліку за замовчуванням — 2026-01-01 у днях від епохи (`calendar.ts`). */
export const DEFAULT_START_DAY = 20454;

export function createWorld(seed: number, fighterCount: number, startDay = DEFAULT_START_DAY): World {
  const generated = generateWorld(seed, fighterCount);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: startDay, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [], titles: {},
  };
}

export class UnknownFighterError extends Error {
  constructor(id: string) {
    super(`У світі немає бійця ${id}`);
    this.name = 'UnknownFighterError';
  }
}

/**
 * Взяти бійця під опіку. Світ від цього не перебудовується: підопічний відрізняється
 * лише тим, що його бої рахуються повністю (рівень 1, `tiers.ts`) — гравець бачить
 * свою кар'єру в деталях, а решта світу лишається наближенням (ADR-0015).
 */
export function startCareer(world: World, fighterId: string): World {
  if (!world.fighters[fighterId]) throw new UnknownFighterError(fighterId);
  if (world.playerFighterIds.includes(fighterId)) return world;
  return { ...world, playerFighterIds: [...world.playerFighterIds, fighterId] };
}

export interface CampView {
  fightId: string;
  fightDay: number;
  /** `null`, поки фаза не почалася. */
  phase: CampPhase | null;
  /** Що діє зараз — рішення гравця або замовчування тренера. */
  focus: string | null;
  load: string | null;
  /** Чи це рішення гравця; `false` означає «так вирішив тренер». */
  chosen: boolean;
  phases: Camp['phases'];
}

export interface NextFightView {
  fightId: string;
  day: number;
  daysAway: number;
  opponentId: string;
  scheduledRounds: number;
  /** `null`, поки табір не відкрився; інакше 0…1 — скільки табору пройдено. */
  campProgress: number | null;
  /** Пояс на кону (ADR-0026), `null` — звичайний бій. */
  titleKey: string | null;
}

export interface StableFighterView {
  fighterId: string;
  age: number;
  record: Fighter['record'];
  condition: Fighter['condition'];
  /** Наскільки боєць близько до власної стелі гостроти: 0…1. */
  readiness: number;
  wear: Fighter['wear'];
  /** Позиції в таблицях органів; `null` — поза топ-15. `champion` — чи тримає цей пояс. */
  rankings: readonly { bodyId: string; position: number | null; champion: boolean }[];
  nextFight: NextFightView | null;
  camp: CampView | null;
  /** Що чекає на рішення саме цього бійця, найближчий дедлайн першим. */
  pending: readonly Decision[];
  recentFights: readonly FightRecordEntry[];
  /** День, до якого боєць недоступний; 0 — доступний. */
  unavailableUntil: number;
}

const RECENT = 5;

/**
 * Стан стайбла на сьогодні. Чиста функція від світу — нічого не зберігає й нічого не рахує
 * наперед: стайбл є **похідною**, як і рейтинги (ADR-0018).
 */
export function playerStable(world: World): readonly StableFighterView[] {
  const window = CONDITION_TUNING.sharpness.campWindowDays;

  return world.playerFighterIds.flatMap((id) => {
    const fighter = world.fighters[id];
    if (!fighter) return [];

    const upcoming = world.schedule
      .filter((f) => f.aId === id || f.bId === id)
      .sort((x, y) => x.day - y.day)[0];

    const nextFight: NextFightView | null = upcoming === undefined ? null : {
      fightId: upcoming.id,
      day: upcoming.day,
      daysAway: upcoming.day - world.day,
      opponentId: upcoming.aId === id ? upcoming.bId : upcoming.aId,
      scheduledRounds: upcoming.scheduledRounds,
      campProgress: upcoming.day - world.day > window
        ? null
        : Math.min(1, Math.max(0, (window - (upcoming.day - world.day)) / window)),
      titleKey: upcoming.titleKey ?? null,
    };

    const camp = world.camps.find((c) => c.fighterId === id);
    const campView: CampView | null = camp === undefined ? null : (() => {
      const daysToFight = camp.fightDay - world.day;
      const phase = campPhaseFor(daysToFight);
      const entry = campEntryFor(camp, daysToFight);
      return {
        fightId: camp.fightId,
        fightDay: camp.fightDay,
        phase,
        focus: entry?.focus ?? null,
        load: entry?.load ?? null,
        chosen: phase !== null && camp.phases[phase] !== undefined,
        phases: camp.phases,
      };
    })();

    const history = world.history[id] ?? [];
    const ceiling = sharpnessCeiling(fighter);

    return [{
      fighterId: id,
      age: fighter.age,
      record: fighter.record,
      condition: fighter.condition,
      readiness: ceiling === 0 ? 0 : Math.min(1, fighter.condition.sharpness / ceiling),
      wear: fighter.wear,
      rankings: SANCTIONING_BODIES.map((body) => {
        const key = rankingKey(body.id, fighter.constants.naturalWeightClassId);
        return {
          bodyId: body.id,
          position: (world.rankings[key] ?? []).find((row) => row.fighterId === id)?.position ?? null,
          champion: world.titles[key]?.championId === id,
        };
      }),
      nextFight,
      camp: campView,
      pending: world.decisions
        .filter((d) => d.fighterId === id)
        .sort((x, y) => x.deadline - y.deadline || (x.id < y.id ? -1 : 1)),
      recentFights: history.slice(-RECENT).reverse(),
      unavailableUntil: world.unavailableUntil[id] ?? 0,
    }];
  });
}
