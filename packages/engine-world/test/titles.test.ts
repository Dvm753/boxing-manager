import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  advanceDay, dispatch, HANDLERS, checkMandatoryDefenses, parseTitleKey, vacantTitle,
  type PlayerCommand, type ScheduledFight, type World, type WorldEvent,
} from '../src/index.js';

const START = 20454;

function makeWorld(seed = 4242, count = 60): World {
  const generated = generateWorld(seed, count);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: START, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [], titles: {},
  };
}

const world = makeWorld();
const ids = Object.keys(world.fighters).sort();
const [a, b, c] = ids as [string, string, string];
const TITLE_KEY = 'gbc/welterweight';

const complete = (
  extra: Partial<Extract<WorldEvent, { t: 'FightCompleted' }>> & { winnerId: string | null },
): { world: World; events: readonly WorldEvent[] } => {
  const event: WorldEvent = {
    t: 'FightCompleted', fightId: 'f1', day: START, aId: a, bId: b,
    method: extra.winnerId === null ? 'D' : 'UD', endingRound: 12, scheduledRounds: 12, tier: 1,
    titleKey: TITLE_KEY, ...extra,
  };
  return dispatch(world, [event], HANDLERS);
};

describe('parseTitleKey / vacantTitle', () => {
  it('розбирає bodyId і weightClassId', () => {
    expect(parseTitleKey('gbc/welterweight')).toEqual({ bodyId: 'gbc', weightClassId: 'welterweight' });
  });

  it('вакантний пояс — championId null, без дедлайну', () => {
    expect(vacantTitle(100)).toEqual({ championId: null, since: 100, defences: 0, mandatoryDueBy: null });
  });
});

describe('титульний бій — заповнення вакансії (ADR-0026)', () => {
  it('переможець вакантного бою стає чемпіоном', () => {
    const { world: next, events } = complete({ winnerId: a });
    expect(next.titles[TITLE_KEY]?.championId).toBe(a);
    expect(next.titles[TITLE_KEY]?.defences).toBe(0);
    expect(next.titles[TITLE_KEY]?.mandatoryDueBy).toBeGreaterThan(START);
    expect(events.some((e) => e.t === 'TitleWon' && e.vacant === true)).toBe(true);
    expect(events.some((e) => e.t === 'NewsCreated' && e.key === 'news.titleWonVacant')).toBe(true);
  });

  it('нічия у вакантному бою лишає пояс вакантним', () => {
    const { world: next, events } = complete({ winnerId: null });
    expect(next.titles[TITLE_KEY]).toBeUndefined();
    expect(events.some((e) => e.t.startsWith('Title'))).toBe(false);
  });

  it('бій без titleKey не чіпає world.titles', () => {
    const { world: next } = dispatch(world, [{
      t: 'FightCompleted', fightId: 'f2', day: START, aId: a, bId: b,
      method: 'UD', winnerId: a, endingRound: 12, scheduledRounds: 12, tier: 1,
    }], HANDLERS);
    expect(next.titles).toEqual({});
  });
});

describe('титульний бій — чемпіон (ADR-0026)', () => {
  const held: World = { ...world, titles: { [TITLE_KEY]: { championId: a, since: START - 100, defences: 2, mandatoryDueBy: START + 30 } } };
  const defend = (winnerId: string | null): { world: World; events: readonly WorldEvent[] } =>
    dispatch(held, [{
      t: 'FightCompleted', fightId: 'f3', day: START, aId: a, bId: c,
      method: winnerId === null ? 'D' : 'UD', winnerId, endingRound: 12, scheduledRounds: 12, tier: 1,
      titleKey: TITLE_KEY,
    }], HANDLERS);

  it('чемпіон перемагає — успішний захист, лічильник росте', () => {
    const { world: next, events } = defend(a);
    expect(next.titles[TITLE_KEY]?.championId).toBe(a);
    expect(next.titles[TITLE_KEY]?.defences).toBe(3);
    expect(next.titles[TITLE_KEY]?.mandatoryDueBy).toBeGreaterThan(START);
    expect(events.some((e) => e.t === 'TitleDefended' && e.defences === 3)).toBe(true);
  });

  it('нічия — пояс лишається чемпіону і рахується захистом (правило боксу)', () => {
    const { world: next, events } = defend(null);
    expect(next.titles[TITLE_KEY]?.championId).toBe(a);
    expect(next.titles[TITLE_KEY]?.defences).toBe(3);
    expect(events.some((e) => e.t === 'TitleDefended')).toBe(true);
  });

  it('претендент перемагає — пояс переходить, лічильник обнуляється', () => {
    const { world: next, events } = defend(c);
    expect(next.titles[TITLE_KEY]?.championId).toBe(c);
    expect(next.titles[TITLE_KEY]?.defences).toBe(0);
    expect(next.titles[TITLE_KEY]?.since).toBe(START);
    expect(events.some((e) => e.t === 'TitleWon' && e.vacant === false && e.championId === c)).toBe(true);
    expect(events.some((e) => e.t === 'NewsCreated' && e.key === 'news.titleWonDethrone')).toBe(true);
  });
});

describe('обов\'язковий захист (ADR-0026)', () => {
  it('прострочений дедлайн без запланованого бою звільняє пояс', () => {
    const held: World = {
      ...world,
      titles: { [TITLE_KEY]: { championId: a, since: START - 400, defences: 1, mandatoryDueBy: START - 1 } },
    };
    const events = checkMandatoryDefenses(held, START);
    expect(events).toEqual([{ t: 'TitleVacated', titleKey: TITLE_KEY, formerChampionId: a, day: START }]);
    const { world: next } = dispatch(held, events, HANDLERS);
    expect(next.titles[TITLE_KEY]).toEqual({ championId: null, since: START, defences: 0, mandatoryDueBy: null });
  });

  it('дедлайн у майбутньому не звільняє пояс', () => {
    const held: World = {
      ...world,
      titles: { [TITLE_KEY]: { championId: a, since: START - 10, defences: 0, mandatoryDueBy: START + 10 } },
    };
    expect(checkMandatoryDefenses(held, START)).toEqual([]);
  });

  it('запланований захист рятує від позбавлення навіть після дедлайну', () => {
    const fight: ScheduledFight = {
      id: 'mandatory-1', day: START + 5, aId: a, bId: c, scheduledRounds: 12, titleKey: TITLE_KEY,
    };
    const held: World = {
      ...world,
      schedule: [fight],
      titles: { [TITLE_KEY]: { championId: a, since: START - 400, defences: 1, mandatoryDueBy: START - 1 } },
    };
    expect(checkMandatoryDefenses(held, START)).toEqual([]);
  });

  it('без чемпіона (вакантний) дедлайн не має сенсу — нічого не відбувається', () => {
    const held: World = { ...world, titles: { [TITLE_KEY]: vacantTitle(START - 5) } };
    expect(checkMandatoryDefenses(held, START)).toEqual([]);
  });
});

describe('титули на довгому прогоні через advanceDay', () => {
  it('пояс, поставлений на кону, справді переходить після бою', () => {
    const fight: ScheduledFight = { id: 'title-1', day: START + 1, aId: a, bId: b, scheduledRounds: 12, titleKey: TITLE_KEY };
    const command: PlayerCommand = { t: 'scheduleFight', fight };
    const { world: next } = advanceDay(world, [command], createRng(1));
    expect(next.titles[TITLE_KEY]).toBeDefined();
    expect([a, b]).toContain(next.titles[TITLE_KEY]?.championId ?? '');
  });
});
