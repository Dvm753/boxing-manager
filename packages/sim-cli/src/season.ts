import { createRng, deriveSeed, type Rng } from '@bm/core-model';
import { advanceDay, rankingKey, type PlayerCommand, type World, type WorldEvent } from '@bm/engine-world';
import { createWorld, decide, type PlayerPolicy } from '@bm/session';
import {
  makeCandidate, proposeCard, proposeTitleFights,
  type MatchCandidate, type TitleCandidate,
} from '@bm/ai';
import { CONDITION_TUNING, SANCTIONING_BODIES } from '@bm/data';

/**
 * Прогін сезону. Пари підбирає **пакет `ai`** тим самим розрахунком, яким користуватиметься
 * гравець — бій виникає лише тоді, коли його хочуть обидві сторони.
 */
export interface SeasonResult {
  world: World;
  fightsHeld: number;
  byTier: Record<number, number>;
  /** Скільки рішень ухвалив гравець за прогін (ADR-0023: орієнтир ~15 на рік на бійця). */
  decisionsMade: number;
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

/**
 * Стан прогону, що переживає окремі дні: потік випадковості матчмейкінгу і день старту.
 * Винесено, щоб світ можна було вести **день за днем** (тиждень гравця в поданні) тим
 * самим кодом, що й прогін сезону одним викликом — без другої копії логіки.
 */
export interface SeasonClock {
  cardSize: number;
  /** Від якого дня рахується «скільки боєць існує у світі» (ADR-0024) і тиждень картки. */
  startedOn: number;
  rng: Rng;
}

export function startSeasonClock(world: World, fightsPerCard?: number): SeasonClock {
  return {
    cardSize: fightsPerCard ?? defaultCardSize(Object.keys(world.fighters).length),
    startedOn: world.day,
    rng: createRng(deriveSeed(world.seed, 'season')),
  };
}

export function runSeason(
  world: World, days: number, fightsPerCard?: number, policy?: PlayerPolicy,
): SeasonResult {
  const clock = startSeasonClock(world, fightsPerCard);
  let current = world;
  let fightsHeld = 0;
  let decisionsMade = 0;
  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

  for (let d = 0; d < days; d++) {
    // Рішення гравця подаються щодня: черга з дедлайнами не чекає (ADR-0020).
    const playerCommands = current.playerFighterIds.length > 0 ? decide(current, policy) : [];
    decisionsMade += playerCommands.length;
    const { world: next, events } = simulateDay(current, clock, playerCommands);
    for (const event of events) {
      if (event.t === 'FightCompleted') {
        fightsHeld++;
        byTier[event.tier] = (byTier[event.tier] ?? 0) + 1;
      }
    }
    current = next;
  }

  return { world: current, fightsHeld, byTier, decisionsMade };
}

/**
 * Один день світу: тижнева картка (якщо сьогодні її день) і тік `advanceDay`.
 * `playerCommands` — рішення гравця на сьогодні, від політики чи з подання.
 */
export function simulateDay(
  current: World, clock: SeasonClock, playerCommands: readonly PlayerCommand[],
): { world: World; events: WorldEvent[] } {
  const { cardSize, startedOn, rng } = clock;
  const commands: PlayerCommand[] = [...playerCommands];

  // Картка раз на тиждень: бокс не проводить бої щодня для тих самих людей.
  if ((current.day - startedOn) % 7 === 0) {
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
    // Пропозиція, що чекає на відповідь, теж займає бійця: інакше промоутери
    // засипали б підопічного новими пропозиціями щотижня, поки він думає.
    for (const decision of current.decisions) {
      if (decision.t === 'fightOffer') { booked.add(decision.fight.aId); booked.add(decision.fight.bId); }
    }
    const fightDay = current.day + SCHEDULE_LEAD_DAYS;

    // Титульні бої (ADR-0026) — вакансії й термінові обов'язкові захисти — складаються
    // **до** звичайної картки: чемпіон і претендент не повинні одночасно потрапити
    // у звичайний бій і в титульний.
    const isAvailable = (fighterId: string): boolean =>
      (current.unavailableUntil[fighterId] ?? 0) <= fightDay;
    const titleCandidates: TitleCandidate[] = Object.keys(current.rankings).sort()
      .map((titleKey): TitleCandidate => ({
        titleKey,
        championId: current.titles[titleKey]?.championId ?? null,
        mandatoryDueBy: current.titles[titleKey]?.mandatoryDueBy ?? null,
        ranked: (current.rankings[titleKey] ?? []).map((row) => row.fighterId),
      }));
    const titleFights = proposeTitleFights(
      titleCandidates, current.day, (id) => booked.has(id), isAvailable,
      // Подвійне вікно домовленості: перша спроба може зірватися (чемпіон чи
      // претендент того тижня зайняті), а друга все одно має встигнути до дедлайну.
      { proposalWindowDays: SCHEDULE_LEAD_DAYS * 2 },
    );
    titleFights.forEach((bout, i) => {
      booked.add(bout.aId);
      booked.add(bout.bId);
      commands.push({
        t: 'scheduleFight',
        fight: {
          id: `t${fightDay}-${i}-${bout.aId.slice(0, 8)}`,
          day: fightDay, aId: bout.aId, bId: bout.bId, scheduledRounds: 12,
          titleKey: bout.titleKey,
        },
      });
    });

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
      // Скільки днів боєць існує в симуляції — годинник «про мене забули» (ADR-0024).
      current.day - startedOn,
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

  return advanceDay(current, commands, rng);
}
