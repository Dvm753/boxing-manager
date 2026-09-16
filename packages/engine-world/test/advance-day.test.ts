import { describe, it, expect } from 'vitest';
import { createRng, deriveSeed, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  advanceDay, dispatch, CascadeDepthExceededError, MAX_CASCADE_DEPTH,
  buildTierIndex, type EventHandler, type PlayerCommand, type World, type WorldEvent,
} from '../src/index.js';

function makeWorld(seed = 2026, count = 600): World {
  const generated = generateWorld(seed, count);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: 20000, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [], titles: {},
  };
}

function scheduleFor(world: World, day: number, howMany: number): PlayerCommand[] {
  const ids = Object.keys(world.fighters).sort();
  const commands: PlayerCommand[] = [];
  for (let i = 0; i < howMany; i++) {
    commands.push({
      t: 'scheduleFight',
      fight: {
        id: `bout-${i}`, day,
        aId: ids[i * 2] as string, bId: ids[i * 2 + 1] as string,
        scheduledRounds: 12,
      },
    });
  }
  return commands;
}

describe('тік дня (ADR-0016)', () => {
  it('день зростає на одиницю і породжує подію', () => {
    const world = makeWorld();
    const { world: next, events } = advanceDay(world, [], createRng(1));
    expect(next.day).toBe(world.day + 1);
    expect(events[0]).toEqual({ t: 'DayAdvanced', day: world.day + 1 });
  });

  it('той самий seed і ті самі команди дають ідентичну послідовність подій', () => {
    const run = (): string => {
      const world = makeWorld();
      const commands = scheduleFor(world, world.day + 1, 25);
      const { events } = advanceDay(world, commands, createRng(deriveSeed(7, 'day')));
      return JSON.stringify(events);
    };
    expect(run()).toBe(run());
  });

  it('світ після тіку теж ідентичний', () => {
    const run = (): string => {
      const world = makeWorld();
      const { world: next } = advanceDay(world, scheduleFor(world, world.day + 1, 20), createRng(3));
      return JSON.stringify({ fighters: next.fighters, news: next.news, wear: next.unavailableUntil });
    };
    expect(run()).toBe(run());
  });

  it('бій відбувається у свій день і зникає з календаря', () => {
    const world = makeWorld();
    const commands = scheduleFor(world, world.day + 1, 3);
    const { world: next, events } = advanceDay(world, commands, createRng(1));
    expect(events.filter((e) => e.t === 'FightCompleted')).toHaveLength(3);
    expect(next.schedule).toHaveLength(0);
  });

  it('бій у майбутньому не відбувається сьогодні', () => {
    const world = makeWorld();
    const commands = scheduleFor(world, world.day + 5, 3);
    const { world: next, events } = advanceDay(world, commands, createRng(1));
    expect(events.filter((e) => e.t === 'FightCompleted')).toHaveLength(0);
    expect(next.schedule).toHaveLength(3);
  });

  it('каскад доходить до рекорду, зносу, травми і новин', () => {
    const world = makeWorld();
    const { world: next, events } = advanceDay(world, scheduleFor(world, world.day + 1, 30), createRng(1));
    const kinds = new Set(events.map((e) => e.t));
    expect(kinds).toContain('FightCompleted');
    expect(kinds).toContain('FighterRecordUpdated');
    expect(kinds).toContain('FighterWearIncreased');
    expect(kinds).toContain('NewsCreated');
    expect(next.news.length).toBe(30);
    expect(Object.keys(next.history).length).toBe(60);
  });

  it('новина несе ключ і параметри, а не готовий текст (ADR-0017)', () => {
    const world = makeWorld();
    const { world: next } = advanceDay(world, scheduleFor(world, world.day + 1, 5), createRng(1));
    for (const item of next.news) {
      expect(item.key.startsWith('news.')).toBe(true);
      expect(typeof item.params).toBe('object');
    }
  });

  it('рекорд змінюється рівно на один бій у кожного учасника', () => {
    const world = makeWorld();
    const ids = Object.keys(world.fighters).sort();
    const before = world.fighters[ids[0] as string] as Fighter;
    const { world: next } = advanceDay(world, scheduleFor(world, world.day + 1, 1), createRng(1));
    const after = next.fighters[ids[0] as string] as Fighter;
    const delta = (after.record.wins + after.record.losses + after.record.draws)
      - (before.record.wins + before.record.losses + before.record.draws);
    expect(delta).toBe(1);
  });

  it('знос росте тільки вгору', () => {
    const world = makeWorld();
    const ids = Object.keys(world.fighters).sort();
    const before = (world.fighters[ids[0] as string] as Fighter).wear;
    const { world: next } = advanceDay(world, scheduleFor(world, world.day + 1, 1), createRng(1));
    const after = (next.fighters[ids[0] as string] as Fighter).wear;
    expect(after.headTrauma).toBeGreaterThanOrEqual(before.headTrauma);
    expect(after.roundsBoxed).toBeGreaterThan(before.roundsBoxed);
  });
});

describe('обмеження каскаду (ADR-0016 §4)', () => {
  it('циклічний обробник падає гучно, а не зависає', () => {
    const world = makeWorld(1, 20);
    const loop: EventHandler = (event, w) => ({
      world: w,
      emit: event.t === 'DayAdvanced' ? [{ t: 'DayAdvanced', day: event.day } as WorldEvent] : [],
    });
    expect(() => dispatch(world, [{ t: 'DayAdvanced', day: 1 }], [loop]))
      .toThrow(CascadeDepthExceededError);
  });

  it('межа глибини дозволяє нормальний каскад', () => {
    expect(MAX_CASCADE_DEPTH).toBeGreaterThanOrEqual(4);
  });
});

describe('рівні деталізації (ADR-0015)', () => {
  it('рівень є похідною від стану, а не збереженим полем', () => {
    const world = makeWorld();
    const first = buildTierIndex(world);
    const second = buildTierIndex(world);
    expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    for (const f of Object.values(world.fighters)) {
      expect(f).not.toHaveProperty('tier');
    }
  });

  it('бійці гравця завжди на повній симуляції', () => {
    const base = makeWorld();
    const weakest = Object.values(base.fighters)
      .sort((a, b) => {
        const av = Object.values(a.attributes).reduce((s, x) => s + x, 0);
        const bv = Object.values(b.attributes).reduce((s, x) => s + x, 0);
        return av - bv;
      })[0] as Fighter;
    const world: World = { ...base, playerFighterIds: [weakest.id] };
    expect(buildTierIndex(world).get(weakest.id)).toBe(1);
  });
});
