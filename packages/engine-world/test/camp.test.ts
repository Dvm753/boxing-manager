import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { CAMP_TUNING, CONDITION_TUNING, generateWorld } from '@bm/data';
import {
  advanceDay, campDecisionId, offerDecisionId, planDecisionId, planFor,
  UnknownDecisionError, WrongPhaseFocusError,
  type PlayerCommand, type ScheduledFight, type World, type WorldEvent,
} from '../src/index.js';

const START = 20454;

function worldOf(count: number, seed = 99): World {
  const generated = generateWorld(seed, count);
  const fighters: Record<string, Fighter> = {};
  for (const f of generated.fighters) fighters[f.id] = f;
  return {
    day: START, seed, fighters, schedule: [], history: {},
    unavailableUntil: {}, playerFighterIds: [], news: [], rankings: {}, rankingsPublishedOn: 0,
    camps: [], decisions: [], titles: {},
  };
}

const base = worldOf(30);
const ids = Object.keys(base.fighters).sort();
const me = ids[0] as string;
const foe = ids[1] as string;
const mine: World = { ...base, playerFighterIds: [me] };

const bout = (day: number, id = 'b1'): ScheduledFight =>
  ({ id, day, aId: me, bId: foe, scheduledRounds: 12 });

const tick = (world: World, commands: PlayerCommand[] = []): { world: World; events: WorldEvent[] } =>
  advanceDay(world, commands, createRng(1));

/**
 * Боєць після року простою. Табір має сенс саме для такого: той, хто вже на своїй
 * стелі гостроти, впирається в неї за будь-якого плану, і різниці між таборами немає.
 * Це не обхід перевірки, а її предмет — рівно тому нижче стоїть окремий тест про стелю.
 */
const rusty: World = (() => {
  let current = mine;
  for (let i = 0; i < 365; i++) current = tick(current).world;
  return current;
})();

describe('пропозиція бою (ADR-0023)', () => {
  it('бій за участю підопічного не потрапляє в календар без згоди', () => {
    const { world, events } = tick(mine, [{ t: 'scheduleFight', fight: bout(START + 70) }]);
    expect(world.schedule).toEqual([]);
    expect(world.decisions).toHaveLength(1);
    expect(events.some((e) => e.t === 'FightOffered')).toBe(true);
  });

  it('бій без підопічного йде в календар як і раніше', () => {
    const fight: ScheduledFight = { id: 'x', day: START + 70, aId: ids[2] as string, bId: ids[3] as string, scheduledRounds: 12 };
    const { world } = tick(base, [{ t: 'scheduleFight', fight }]);
    expect(world.schedule).toHaveLength(1);
    expect(world.decisions).toEqual([]);
  });

  it('згода ставить бій у календар і відкриває табір', () => {
    const offered = tick(mine, [{ t: 'scheduleFight', fight: bout(START + 70) }]).world;
    const { world, events } = tick(offered, [{ t: 'acceptOffer', decisionId: offerDecisionId('b1') }]);
    expect(world.schedule.map((f) => f.id)).toEqual(['b1']);
    expect(world.camps).toHaveLength(1);
    expect(events.some((e) => e.t === 'OfferAccepted')).toBe(true);
  });

  it('відмова прибирає пропозицію і бою не буде', () => {
    const offered = tick(mine, [{ t: 'scheduleFight', fight: bout(START + 70) }]).world;
    const { world, events } = tick(offered, [{ t: 'declineOffer', decisionId: offerDecisionId('b1') }]);
    expect(world.schedule).toEqual([]);
    expect(world.decisions).toEqual([]);
    expect(events.some((e) => e.t === 'OfferDeclined' && e.expired === false)).toBe(true);
  });

  it('прострочена пропозиція вважається відхиленою, а не зависає', () => {
    let world = tick(mine, [{ t: 'scheduleFight', fight: bout(START + 70) }]).world;
    let expiredSeen = false;
    for (let i = 0; i < CAMP_TUNING.decision.offerDeadlineDays + 2; i++) {
      const step = tick(world);
      world = step.world;
      if (step.events.some((e) => e.t === 'OfferDeclined' && e.expired === true)) expiredSeen = true;
    }
    expect(expiredSeen).toBe(true);
    expect(world.decisions).toEqual([]);
    expect(world.schedule).toEqual([]);
  });

  it('невідоме рішення — помилка, а не мовчазне ігнорування', () => {
    expect(() => tick(mine, [{ t: 'acceptOffer', decisionId: 'нема' }])).toThrow(UnknownDecisionError);
  });
});

/** Прогін табору від згоди до дня перед боєм. */
function camp(
  world: World, fightDay: number, choose: (w: World) => PlayerCommand[],
): { world: World; events: WorldEvent[] } {
  let current = tick(world, [{ t: 'scheduleFight', fight: bout(fightDay) }]).world;
  current = tick(current, [{ t: 'acceptOffer', decisionId: offerDecisionId('b1') }]).world;
  const all: WorldEvent[] = [];
  while (current.day < fightDay - 1) {
    const step = tick(current, choose(current));
    current = step.world;
    all.push(...step.events);
  }
  return { world: current, events: all };
}

const chooseAll = (focus: string, load: string) => (w: World): PlayerCommand[] =>
  w.decisions.flatMap((d): PlayerCommand[] => {
    if (d.t !== 'campPhase') return [];
    const phase = d.phase;
    const wanted = phase === 'base' ? focus === 'heavy' ? 'stamina' : 'general'
      : phase === 'work' ? focus === 'heavy' ? 'sparring' : 'technique'
      : focus === 'heavy' ? 'peak' : 'rest';
    return [{ t: 'setCampPhase', decisionId: d.id, focus: wanted as never, load: load as never }];
  });

describe('табір (ADR-0023)', () => {
  const fightDay = START + 70;

  const rustyDay = rusty.day + 70;
  const sharp = (w: World): number => (w.fighters[me] as Fighter).condition.sharpness;

  it('важкий табір дає більше гостроти, ніж легкий, за тієї самої стелі', () => {
    const heavy = camp(rusty, rustyDay, chooseAll('heavy', 'heavy')).world;
    const light = camp(rusty, rustyDay, chooseAll('light', 'light')).world;
    expect(sharp(heavy)).toBeGreaterThan(sharp(light));
  });

  it('боєць на своїй стелі однаково гострий за будь-якого табору — росте лише ціна', () => {
    const heavy = camp(mine, fightDay, chooseAll('heavy', 'heavy')).world;
    const light = camp(mine, fightDay, chooseAll('light', 'light')).world;
    expect(sharp(heavy)).toBe(sharp(light));
  });

  it('важкий табір коштує свіжості — вибір не безкоштовний', () => {
    const heavy = camp(rusty, rustyDay, chooseAll('heavy', 'heavy')).world;
    const light = camp(rusty, rustyDay, chooseAll('light', 'light')).world;
    const fresh = (w: World): number => (w.fighters[me] as Fighter).condition.freshness;
    expect(fresh(heavy)).toBeLessThan(fresh(light));
  });

  it('без жодного рішення гравця боєць усе одно готується — за тренером', () => {
    const before = (rusty.fighters[me] as Fighter).condition.sharpness;
    const after = camp(rusty, rustyDay, () => []).world;
    expect((after.fighters[me] as Fighter).condition.sharpness).toBeGreaterThan(before);
  });

  it('пропущений дедлайн фази віддає її тренеру, а не ламає табір', () => {
    const { events } = camp(rusty, rustyDay, () => []);
    const coach = events.filter((e) => e.t === 'CampPhaseSet' && e.byCoach === true);
    expect(coach.length).toBeGreaterThanOrEqual(3);
  });

  it('табір не змінює майстерності — лише форму', () => {
    const after = camp(rusty, rustyDay, chooseAll('heavy', 'heavy')).world;
    expect((after.fighters[me] as Fighter).attributes)
      .toEqual((rusty.fighters[me] as Fighter).attributes);
  });

  it('за бій гравець ухвалює рівно п\'ять рішень: пропозиція, три фази, план', () => {
    let count = 0;
    camp(mine, fightDay, (w) => {
      const commands = w.decisions.map((d): PlayerCommand => d.t === 'campPhase'
        ? { t: 'setCampPhase', decisionId: d.id, focus: CAMP_TUNING.defaults[d.phase].focus, load: 'normal' }
        : { t: 'setFightPlan', decisionId: d.id, plan: 'boxing' });
      count += commands.length;
      return commands;
    });
    // Пропозиція ухвалюється у `camp`, тому тут рахуються чотири рішення з п'яти.
    expect(count).toBe(4);
  });

  it('фокус не з тієї фази — помилка', () => {
    // Бій усередині вікна табору, щоб питання по фазі з'явилося одразу.
    const soon = mine.day + CONDITION_TUNING.sharpness.campWindowDays;
    let current = tick(mine, [{ t: 'scheduleFight', fight: bout(soon) }]).world;
    current = tick(current, [{ t: 'acceptOffer', decisionId: offerDecisionId('b1') }]).world;
    const decision = current.decisions.find((d) => d.t === 'campPhase');
    expect(decision).toBeDefined();
    expect(() => tick(current, [{
      t: 'setCampPhase', decisionId: decision?.id as string, focus: 'sparring', load: 'normal',
    }])).toThrow(WrongPhaseFocusError);
  });

  it('перша фаза не зникає, коли бій домовлено рівно на вікно табору', () => {
    const window = CONDITION_TUNING.sharpness.campWindowDays;
    let current = tick(mine, [{ t: 'scheduleFight', fight: bout(START + window + 1) }]).world;
    current = tick(current, [{ t: 'acceptOffer', decisionId: offerDecisionId('b1') }]).world;
    expect(current.decisions.map((d) => d.id)).toContain(campDecisionId('b1', 'base'));
  });
});

describe('план на бій (ADR-0014, ADR-0023)', () => {
  it('питається перед боєм і потрапляє в табір', () => {
    const fightDay = START + 70;
    let current = tick(mine, [{ t: 'scheduleFight', fight: bout(fightDay) }]).world;
    current = tick(current, [{ t: 'acceptOffer', decisionId: offerDecisionId('b1') }]).world;
    let asked = false;
    while (current.day < fightDay - 1) {
      const plan = current.decisions.find((d) => d.t === 'fightPlan');
      const commands: PlayerCommand[] = plan
        ? [{ t: 'setFightPlan', decisionId: plan.id, plan: 'pressure' }]
        : [];
      if (plan) asked = true;
      current = tick(current, commands).world;
    }
    expect(asked).toBe(true);
    expect(current.camps[0]?.plan).toBe('pressure');
    expect(planDecisionId('b1')).toBe('plan/b1');
  });

  it('план зсуває власні осі бійця, а не задає нові', () => {
    const fighter = mine.fighters[me] as Fighter;
    const plan = planFor(fighter, 'pressure');
    expect(plan.baseAxes?.pressure).toBe(Math.min(20, fighter.styleAxes.pressure + 4));
    for (const value of Object.values(plan.baseAxes ?? {})) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it('«збалансований» означає «бийся за своїми осями»', () => {
    expect(planFor(mine.fighters[me] as Fighter, 'balanced').baseAxes).toBeUndefined();
    expect(planFor(mine.fighters[me] as Fighter, undefined).blocks).toEqual([]);
  });
});
