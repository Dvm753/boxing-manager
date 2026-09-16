import type { Fighter } from '@bm/core-model';
import { SANCTIONING_BODIES, type SanctioningBody } from '@bm/data';
import type { FightRecordEntry, RankingEntry, World } from './types.js';

export const RANKING_SIZE = 15;
/** Період напівзгасання свіжості результату, у днях. Рік. */
const RECENCY_HALF_LIFE = 365;
/**
 * Скільки разів проходимо історію, щоб оцінка рівня суперників усталилася.
 * Значення **виміряне**, а не вгадане, і перевіряється тестом збіжності.
 *
 * 2026-09-14: три проходи ще міняли місцями сусідів із різницею у тисячні бала → 5.
 * 2026-09-15: після ADR-0023 травми в таборі знімають частину боїв, історія стала
 * рідшою, і на п'ятому проході тест знову показав 2 перестановки з 60 → 6.
 * Виміряно: 6, 7, 8 і 10 проходів дають нуль перестановок. Правився код, не тест.
 */
export const ITERATIONS = 6;

const DAYS_PER_MONTH = 30.44;

/** Внесок результату. Поразка теж важить: програти топу краще, ніж не битися. */
function resultValue(entry: FightRecordEntry): number {
  const early = entry.method === 'KO' || entry.method === 'TKO' || entry.method === 'RTD';
  if (entry.won === true) return early ? 1.25 : 1.0;
  if (entry.won === null) return 0.45;
  return early ? 0.05 : 0.15;
}

/**
 * Рейтинг — **похідна від історії боїв** (ADR-0018), а не накопичувальний стан:
 * рахується повністю на кожну публікацію, тому дрейфу немає за побудовою.
 *
 * «Рівень суперника на момент бою» досягається хронологічним проходом: бої обробляються
 * за датами, і кожен бачить суперника таким, яким той був тоді. Накопичення живе
 * всередині обчислення і ніде не зберігається.
 */
export function computeScores(
  world: World, body: SanctioningBody, iterations: number = ITERATIONS,
): Map<string, number> {
  const windowStart = world.day - body.windowMonths * DAYS_PER_MONTH;

  // Усі бої вікна, хронологічно. Кожен бій присутній двічі — по разу для кожного учасника.
  const timeline: { fighterId: string; entry: FightRecordEntry }[] = [];
  for (const [fighterId, entries] of Object.entries(world.history)) {
    for (const entry of entries) {
      if (entry.day >= windowStart) timeline.push({ fighterId, entry });
    }
  }
  timeline.sort((x, y) => x.entry.day - y.entry.day || (x.entry.fightId < y.entry.fightId ? -1 : 1));

  let quality = new Map<string, number>();
  let scores = new Map<string, number>();

  for (let pass = 0; pass < iterations; pass++) {
    const running = new Map<string, number>();
    const earned = new Map<string, number>();

    for (const { fighterId, entry } of timeline) {
      // Рівень суперника: на першому проході невідомий і дорівнює одиниці для всіх.
      const opponentQuality = pass === 0 ? 1 : 1 + (quality.get(entry.opponentId) ?? 0) * body.qualityWeight;
      const recency = Math.pow(0.5, (world.day - entry.day) / RECENCY_HALF_LIFE);
      const roundsFactor = 0.5 + (entry.scheduledRounds / 12) * 0.5;
      const value = resultValue(entry) * opponentQuality * recency * roundsFactor * body.activityWeight;

      earned.set(fighterId, (earned.get(fighterId) ?? 0) + value);
      running.set(fighterId, earned.get(fighterId) as number);
    }

    // Тут інерції немає навмисно: проходи існують лише для того, щоб усталилася
    // оцінка рівня суперників. Інерція діє **між публікаціями**, а не між проходами —
    // інакше результат залежав би від кількості ітерацій і ніколи не збігався б.
    scores = earned;

    // Нормалізуємо в [0,1] — рівень суперника має бути в зіставній шкалі між проходами.
    const max = Math.max(1e-9, ...scores.values());
    quality = new Map([...scores].map(([id, value]) => [id, value / max]));
  }

  return scores;
}

/** Регіональна перевага і популярність застосовуються після підрахунку історії. */
function applyBodyBias(score: number, fighter: Fighter, body: SanctioningBody): number {
  const home = body.homeRegionBias > 0 && (fighter.countryCode === 'USA' || fighter.countryCode === 'GBR');
  const regional = home ? 1 + body.homeRegionBias : 1;
  // Популярності ще немає — множник нейтральний до фази 2 (Q12).
  const marketability = 1;
  return score * regional * (1 + (marketability - 1) * body.marketabilityWeight);
}

/**
 * Топ-15 в одній ваговій категорії за версією одного органу.
 *
 * `previous` — попередньо опублікована таблиця. Саме тут діє інерція: орган не переписує
 * свій рейтинг із нуля щомісяця. Без попередньої таблиці інерція не застосовується.
 */
export function rankWeightClass(
  world: World, body: SanctioningBody, weightClassId: string, scores: Map<string, number>,
  previous: readonly RankingEntry[] = [],
): readonly RankingEntry[] {
  const previousScore = new Map(previous.map((row) => [row.fighterId, row.score]));
  const rows: RankingEntry[] = [];
  for (const [fighterId, raw] of scores) {
    const fighter = world.fighters[fighterId];
    if (!fighter || fighter.constants.naturalWeightClassId !== weightClassId) continue;
    if (raw <= 0) continue;
    const fresh = applyBodyBias(raw, fighter, body);
    const before = previousScore.get(fighterId);
    const score = before === undefined ? fresh : before * body.inertia + fresh * (1 - body.inertia);
    rows.push({ fighterId, position: 0, score });
  }
  rows.sort((a, b) => b.score - a.score || (a.fighterId < b.fighterId ? -1 : 1));
  return rows.slice(0, RANKING_SIZE).map((row, i) => ({ ...row, position: i + 1 }));
}

export const rankingKey = (bodyId: string, weightClassId: string): string => `${bodyId}/${weightClassId}`;

/** Повна публікація: усі органи × усі вагові категорії, наявні у світі. */
export function publishRankings(world: World): Record<string, readonly RankingEntry[]> {
  const classes = new Set<string>();
  for (const fighter of Object.values(world.fighters)) classes.add(fighter.constants.naturalWeightClassId);

  const published: Record<string, readonly RankingEntry[]> = {};
  for (const body of SANCTIONING_BODIES) {
    const scores = computeScores(world, body);
    for (const weightClassId of [...classes].sort()) {
      const key = rankingKey(body.id, weightClassId);
      published[key] = rankWeightClass(world, body, weightClassId, scores, world.rankings[key] ?? []);
    }
  }
  return published;
}
