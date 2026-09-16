import type { EventHandler, HandlerResult } from './event-bus.js';
import { conditionAfterFight } from './condition.js';
import { nextMandatoryDueBy, parseTitleKey, titleAt, vacantTitle } from './titles.js';
import type { ConditionChange, FightRecordEntry, TitleState, World, WorldEvent } from './types.js';

const unchanged = (world: World): HandlerResult => ({ world });

/**
 * Кожен обробник змінює **лише власний агрегат** (ADR-0016 §5) і публікує похідні події.
 * Порядок у масиві `HANDLERS` є частиною контракту: від нього залежить детермінізм.
 */

/** Рекорд і історія боїв. */
const recordHandler: EventHandler = (event, world) => {
  if (event.t !== 'FightCompleted') return unchanged(world);

  const entryFor = (self: string, other: string): FightRecordEntry => ({
    fightId: event.fightId,
    day: event.day,
    opponentId: other,
    method: event.method,
    won: event.winnerId === null ? null : event.winnerId === self,
    endingRound: event.endingRound,
    scheduledRounds: event.scheduledRounds,
    tier: event.tier,
  });

  const fighters = { ...world.fighters };
  const history = { ...world.history };
  const isKo = event.method === 'KO' || event.method === 'TKO' || event.method === 'RTD';

  for (const [self, other] of [[event.aId, event.bId], [event.bId, event.aId]] as const) {
    const fighter = fighters[self];
    if (!fighter) continue;
    const won = event.winnerId === null ? null : event.winnerId === self;
    fighters[self] = {
      ...fighter,
      record: {
        wins: fighter.record.wins + (won === true ? 1 : 0),
        losses: fighter.record.losses + (won === false ? 1 : 0),
        draws: fighter.record.draws + (won === null ? 1 : 0),
        knockouts: fighter.record.knockouts + (won === true && isKo ? 1 : 0),
      },
    };
    history[self] = [...(history[self] ?? []), entryFor(self, other)];
  }

  return {
    world: { ...world, fighters, history },
    emit: [
      { t: 'FighterRecordUpdated', fighterId: event.aId, day: event.day },
      { t: 'FighterRecordUpdated', fighterId: event.bId, day: event.day },
      {
        t: 'FighterWearIncreased', fighterId: event.aId,
        rounds: event.endingRound, headDelta: event.winnerId === event.aId ? 1 : 3,
      },
      {
        t: 'FighterWearIncreased', fighterId: event.bId,
        rounds: event.endingRound, headDelta: event.winnerId === event.bId ? 1 : 3,
      },
      {
        t: 'NewsCreated',
        key: event.winnerId === null ? 'news.fightDrawn' : 'news.fightWon',
        params: {
          winner: event.winnerId ?? '',
          loser: event.winnerId === event.aId ? event.bId : event.aId,
          method: event.method,
          round: event.endingRound,
        },
      },
    ],
  };
};

/** Знос: тільки вгору, незворотно (DOMAIN_MODEL). */
const wearHandler: EventHandler = (event, world) => {
  if (event.t !== 'FighterWearIncreased') return unchanged(world);
  const fighter = world.fighters[event.fighterId];
  if (!fighter) return unchanged(world);

  const headTrauma = Math.min(100, fighter.wear.headTrauma + event.headDelta);
  const emit: WorldEvent[] = [];

  // Відновлення після КОЖНОГО бою, а не лише після травми. Раніше переможець був
  // доступний уже наступного тижня, через що найактивніші бійці проводили по 20 боїв
  // за три роки з проміжком у 7 днів — світ ставав неправдоподібним.
  // Вісім тижнів базово, довше після важкого бою і зі зростанням зносу.
  const recovery = 56 + event.rounds * 2 + Math.round(headTrauma * 0.35);
  emit.push({ t: 'FighterRecovering', fighterId: event.fighterId, daysOut: recovery });

  // Форма падає від того самого бою, але окремою подією: знос незворотний, форма — ні.
  emit.push({
    t: 'FighterConditionDrained', fighterId: event.fighterId,
    rounds: event.rounds, headDelta: event.headDelta,
  });

  // Травма — окрема, довша пауза поверх відновлення.
  if (event.headDelta >= 3 && event.rounds >= 8) {
    emit.push({ t: 'FighterInjured', fighterId: event.fighterId, daysOut: 45 + Math.round(headTrauma * 0.8) });
  }

  return {
    world: {
      ...world,
      fighters: {
        ...world.fighters,
        [event.fighterId]: {
          ...fighter,
          wear: {
            headTrauma,
            bodyWear: Math.min(100, fighter.wear.bodyWear + Math.round(event.rounds * 0.4)),
            roundsBoxed: fighter.wear.roundsBoxed + event.rounds,
          },
        },
      },
    },
    emit,
  };
};

/** Доступність бійця. Беремо найпізнішу з причин: травма не скорочує відновлення. */
const availabilityHandler: EventHandler = (event, world) => {
  if (event.t !== 'FighterInjured' && event.t !== 'FighterRecovering') return unchanged(world);
  const until = world.day + event.daysOut;
  const current = world.unavailableUntil[event.fighterId] ?? 0;
  if (until <= current) return unchanged(world);
  return {
    world: { ...world, unavailableUntil: { ...world.unavailableUntil, [event.fighterId]: until } },
  };
};

/**
 * Форма (ADR-0022). Єдиний обробник, що змінює `condition`: денний перерахунок і
 * провал після бою приходять сюди, більше форму не чіпає ніхто.
 */
const applyChanges = (world: World, changes: readonly ConditionChange[]): World => {
  if (changes.length === 0) return world;
  const fighters = { ...world.fighters };
  for (const change of changes) {
    const fighter = fighters[change.fighterId];
    if (!fighter) continue;
    fighters[change.fighterId] = {
      ...fighter,
      condition: { ...fighter.condition, sharpness: change.sharpness, freshness: change.freshness },
    };
  }
  return { ...world, fighters };
};

const conditionHandler: EventHandler = (event, world) => {
  if (event.t === 'ConditionAdvanced') return { world: applyChanges(world, event.changes) };
  if (event.t !== 'FighterConditionDrained') return unchanged(world);
  const fighter = world.fighters[event.fighterId];
  if (!fighter) return unchanged(world);
  return { world: applyChanges(world, [conditionAfterFight(fighter, event.rounds, event.headDelta)]) };
};

/**
 * Травма в таборі (ADR-0023). Обробник **не** чіпає доступність напряму — він публікує
 * `FighterInjured`, бо доступність належить іншому агрегату (ADR-0016 §5).
 * Якщо пауза накриває дату бою, бій знімається: травма, яка ні на що не впливає, —
 * фальшива механіка.
 */
const campInjuryHandler: EventHandler = (event, world) => {
  if (event.t !== 'CampInjury') return unchanged(world);
  const emit: WorldEvent[] = [
    { t: 'FighterInjured', fighterId: event.fighterId, daysOut: event.daysOut },
    { t: 'NewsCreated', key: 'news.campInjury', params: { fighter: event.fighterId, days: event.daysOut } },
  ];
  // Знімається бій із **календаря**, а не з табору: у бійців ШІ таборів немає,
  // але травма має коштувати їм так само, як підопічному.
  const backOn = world.day + event.daysOut;
  for (const fight of world.schedule) {
    if (fight.aId !== event.fighterId && fight.bId !== event.fighterId) continue;
    if (fight.day > backOn) continue;
    emit.push({ t: 'FightWithdrawn', fightId: fight.id, fighterId: event.fighterId, reason: 'injury' });
  }
  return { world, emit };
};

/**
 * Пояси (ADR-0026). Єдиний обробник, що змінює `world.titles`: результат титульного бою
 * і прострочений обов'язковий захист приходять сюди, більше пояс не чіпає ніхто.
 *
 * Нічия в титульному бою лишає пояс чемпіону — це правило боксу, не спрощення моделі,
 * і рахується **успішним захистом**, як і перемога.
 */
const titleHandler: EventHandler = (event, world) => {
  if (event.t === 'TitleVacated') {
    return {
      world: { ...world, titles: { ...world.titles, [event.titleKey]: vacantTitle(event.day) } },
      emit: [{
        t: 'NewsCreated', key: 'news.titleVacated',
        params: { titleKey: event.titleKey, champion: event.formerChampionId },
      }],
    };
  }

  if (event.t !== 'FightCompleted' || event.titleKey === undefined) return unchanged(world);

  const { bodyId } = parseTitleKey(event.titleKey);
  const current = titleAt(world, event.titleKey);
  const dueBy = nextMandatoryDueBy(event.day, bodyId);

  // Нічия без чемпіона (вакантний бій закінчився внічию) — вакансія лишається вакансією,
  // тут нема чого змінювати чи повідомляти окремо: `news.fightDrawn` уже сказав своє.
  if (event.winnerId === null && current.championId === null) return unchanged(world);

  // Нічия з чемпіоном — успішний захист: пояс лишається на місці.
  const defended = event.winnerId === null || event.winnerId === current.championId;

  if (defended && current.championId !== null) {
    const next: TitleState = { ...current, defences: current.defences + 1, mandatoryDueBy: dueBy };
    return {
      world: { ...world, titles: { ...world.titles, [event.titleKey]: next } },
      emit: [
        {
          t: 'TitleDefended', titleKey: event.titleKey, championId: current.championId, day: event.day,
          defences: next.defences,
        },
        {
          t: 'NewsCreated', key: 'news.titleDefended',
          params: { titleKey: event.titleKey, champion: current.championId, defences: next.defences },
        },
      ],
    };
  }

  // Інакше — новий чемпіон: або заповнена вакансія, або скинутий чемпіон.
  const winnerId = event.winnerId as string;
  const next: TitleState = { championId: winnerId, since: event.day, defences: 0, mandatoryDueBy: dueBy };
  return {
    world: { ...world, titles: { ...world.titles, [event.titleKey]: next } },
    emit: [
      {
        t: 'TitleWon', titleKey: event.titleKey, championId: winnerId, day: event.day,
        vacant: current.championId === null,
      },
      {
        t: 'NewsCreated',
        key: current.championId === null ? 'news.titleWonVacant' : 'news.titleWonDethrone',
        params: { titleKey: event.titleKey, champion: winnerId, former: current.championId ?? '' },
      },
    ],
  };
};

/** Календар і табори: єдиний обробник, що знімає бій із розкладу. */
const withdrawalHandler: EventHandler = (event, world) => {
  if (event.t !== 'FightWithdrawn') return unchanged(world);
  return {
    world: {
      ...world,
      schedule: world.schedule.filter((f) => f.id !== event.fightId),
      camps: world.camps.filter((c) => c.fightId !== event.fightId),
      decisions: world.decisions.filter((d) => !d.id.endsWith(event.fightId)
        && !d.id.includes(`${event.fightId}/`)),
    },
    emit: [{
      t: 'NewsCreated', key: 'news.fightWithdrawn',
      params: { fighter: event.fighterId, reason: event.reason },
    }],
  };
};

/** Стрічка новин. Зберігає ключ і параметри, не готовий рядок (ADR-0017). */
const newsHandler: EventHandler = (event, world) => {
  if (event.t !== 'NewsCreated') return unchanged(world);
  return {
    world: { ...world, news: [...world.news, { day: world.day, key: event.key, params: event.params }] },
  };
};

export const HANDLERS: readonly EventHandler[] = [
  recordHandler, wearHandler, availabilityHandler, conditionHandler,
  campInjuryHandler, withdrawalHandler, titleHandler, newsHandler,
];
