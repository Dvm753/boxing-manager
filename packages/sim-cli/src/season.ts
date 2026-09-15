import { createRng, deriveSeed } from '@bm/core-model';
import { advanceDay, rankingKey, type PlayerCommand, type World } from '@bm/engine-world';
import { createWorld } from '@bm/session';
import { makeCandidate, proposeCard, type MatchCandidate } from '@bm/ai';
import { CONDITION_TUNING, SANCTIONING_BODIES } from '@bm/data';

/**
 * Прогін сезону. Пари підбирає **пакет `ai`** тим самим розрахунком, яким користуватиметься
 * гравець — бій виникає лише тоді, коли його хочуть обидві сторони.
 */
export interface SeasonResult {
  world: World;
  fightsHeld: number;
  byTier: Record<number, number>;
}

/** Створення світу живе в `session` — це частина життєвого циклу кар'єри, не прогону. */
export const buildWorld = createWorld;

/**
 * Розмір тижневої картки за замовчуванням масштабується зі світом: фіксоване число
 * означало б, що у світі з 2000 бійців кожен виходить у ринг раз на шість років.
 * Орієнтир — 2.5 бої на бійця на рік, тобто ~`n × 2.5 / 52 / 2` пар на тиждень.
 */
export const defaultCardSize = (fighterCount: number): number =>
  Math.max(4, Math.round((fighterCount * 2.5) / 52 / 2));

/**
 * За скільки днів наперед домовляються про бій. Дорівнює вікну табору (ADR-0022) —
 * і це не збіг: **проміжок між домовленістю і боєм і є табором**. Доки картка
 * складалася на завтра, табору не існувало фізично, хоч би що казала модель.
 */
export const SCHEDULE_LEAD_DAYS = CONDITION_TUNING.sharpness.campWindowDays;

export function runSeason(world: World, days: number, fightsPerCard?: number): SeasonResult {
  const cardSize = fightsPerCard ?? defaultCardSize(Object.keys(world.fighters).length);
  let current = world;
  let fightsHeld = 0;
  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const rng = createRng(deriveSeed(world.seed, 'season'));

  for (let d = 0; d < days; d++) {
    const commands: PlayerCommand[] = [];

    // Картка раз на тиждень: бокс не проводить бої щодня для тих самих людей.
    if (d % 7 === 0) {
      const lastFightDay = new Map<string, number>();
      for (const [fighterId, entries] of Object.entries(current.history)) {
        const last = entries.at(-1);
        if (last) lastFightDay.set(fighterId, last.day);
      }

      // Позиції в таблицях беремо через індекс, а не пошуком по кожному бійцю.
      const positionOf = new Map<string, number>();
      for (const [key, table] of Object.entries(current.rankings)) {
        for (const row of table) positionOf.set(`${key}|${row.fighterId}`, row.position);
      }

      // Боєць, який уже стоїть у календарі, нового бою не бере: домовленість
      // за вісім тижнів наперед означає, що інакше його можна було б записати двічі.
      const booked = new Set<string>();
      for (const fight of current.schedule) { booked.add(fight.aId); booked.add(fight.bId); }
      const fightDay = current.day + SCHEDULE_LEAD_DAYS;

      const candidates: MatchCandidate[] = Object.values(current.fighters)
        .filter((fighter) => !booked.has(fighter.id))
        .map((fighter) => makeCandidate(
        fighter,
        SANCTIONING_BODIES.map((body) => ({
          bodyId: body.id,
          position: positionOf.get(
            `${rankingKey(body.id, fighter.constants.naturalWeightClassId)}|${fighter.id}`,
          ) ?? null,
        })),
        lastFightDay.get(fighter.id) ?? null,
        // Доступність перевіряється на **день бою**, а не на сьогодні: боєць,
        // який відновлюється ще місяць, до дати бою вже буде готовий.
        (current.unavailableUntil[fighter.id] ?? 0) <= fightDay,
      ));

      const card = proposeCard(candidates, { day: current.day, rng }, { targetBouts: cardSize });
      card.forEach((bout, i) => {
        commands.push({
          t: 'scheduleFight',
          fight: {
            id: `d${fightDay}-${i}-${bout.aId.slice(0, 8)}`,
            day: fightDay,
            aId: bout.aId, bId: bout.bId,
            scheduledRounds: 12,
          },
        });
      });
    }

    const { world: next, events } = advanceDay(current, commands, rng);
    for (const event of events) {
      if (event.t === 'FightCompleted') {
        fightsHeld++;
        byTier[event.tier] = (byTier[event.tier] ?? 0) + 1;
      }
    }
    current = next;
  }

  return { world: current, fightsHeld, byTier };
}
