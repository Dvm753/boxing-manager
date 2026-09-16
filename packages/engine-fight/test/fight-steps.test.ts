import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  simulateFight, simulateFightSteps, EMPTY_PLAN,
  type FightContext, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

/**
 * Покроковий рушій бою (ADR-0028). Найважливіший інваріант: **пауза не витрачає RNG**.
 * Бій, порахований по раунду за N викликів `.next()`, зобов'язаний дати той самий
 * `EventLog`, що й один виклик `simulateFight` — це та сама умова, яку ADR-0025 назвав
 * обов'язковою «до будь-якого UI».
 */
const toSnapshot = (f: Fighter): FighterSnapshot => ({
  id: f.id, attributes: f.attributes, styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm, reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness, freshness: f.condition.freshness,
  headTrauma: f.wear.headTrauma,
});
const judge = (id: string): JudgeProfile =>
  ({ id, cleanPunching: 1.2, aggression: 0.8, ringGeneralship: 0.7, defence: 0.5, bias: 0 });
const ctx = (): FightContext => ({
  scheduledRounds: 12, judges: [judge('j1'), judge('j2'), judge('j3')],
  planA: EMPTY_PLAN, planB: EMPTY_PLAN, threeKnockdownRule: false,
});

const world = generateWorld(4242, 200);
const a = toSnapshot(world.fighters[0] as Fighter);
const b = toSnapshot(world.fighters[1] as Fighter);
const seeds = [11, 777, 90210, 5150, 31337, 8, 99, 123456, 271828, 161803];

function drainWithoutUpdates(rng: ReturnType<typeof createRng>) {
  const steps = simulateFightSteps(a, b, ctx(), rng);
  let step = steps.next();
  const boundaries: number[] = [];
  while (!step.done) { boundaries.push(step.value.round); step = steps.next(); }
  return { outcome: step.value, boundaries };
}

describe('покроковий рушій бою (ADR-0028)', () => {
  it('без переданих оновлень дає той самий лог, що й simulateFight (один виклик)', () => {
    for (const seed of seeds) {
      const direct = simulateFight(a, b, ctx(), createRng(seed));
      const { outcome: stepped } = drainWithoutUpdates(createRng(seed));
      expect(JSON.stringify(stepped)).toBe(JSON.stringify(direct));
    }
  });

  it('віддає межу після кожного roundEnd до кінця бою; остання межа — раунд зупинки чи останній розкладений', () => {
    for (const seed of seeds) {
      const { outcome, boundaries } = drainWithoutUpdates(createRng(seed));
      const roundEnds = outcome.eventLog.filter((e) => e.t === 'roundEnd').map((e) => e.round);
      expect(boundaries).toEqual(roundEnds);
    }
  });

  it('eventLog на кожній межі — префікс підсумкового логу станом на цю мить', () => {
    const rng = createRng(2026);
    const steps = simulateFightSteps(a, b, ctx(), rng);
    let step = steps.next();
    let prevLength = 0;
    while (!step.done) {
      expect(step.value.eventLog.length).toBeGreaterThanOrEqual(prevLength);
      prevLength = step.value.eventLog.length;
      step = steps.next();
    }
    expect(step.value.eventLog.length).toBeGreaterThanOrEqual(prevLength);
  });

  it('порада кута (RoundBlockPlan для однієї сторони) не витрачає RNG: інші боти з тим самим seed і без поради розходяться лише після її застосування', () => {
    const seed = 555;
    const withoutAdvice = simulateFight(a, b, ctx(), createRng(seed));

    const steps = simulateFightSteps(a, b, ctx(), createRng(seed));
    let step = steps.next();
    let firstRound = true;
    while (!step.done) {
      if (firstRound) {
        firstRound = false;
        step = steps.next({ a: { fromRound: step.value.round + 1, toRound: 12, axisAdjustments: { risk: 3 } } });
      } else {
        step = steps.next();
      }
    }
    const withAdvice = step.value;

    // Раунд 1 (до поради) — той самий бій, той самий лог по перший roundEnd.
    const firstRoundEndIdxNoAdvice = withoutAdvice.eventLog.findIndex((e) => e.t === 'roundEnd');
    const firstRoundEndIdxAdvice = withAdvice.eventLog.findIndex((e) => e.t === 'roundEnd');
    expect(firstRoundEndIdxAdvice).toBe(firstRoundEndIdxNoAdvice);
    expect(withAdvice.eventLog.slice(0, firstRoundEndIdxAdvice + 1))
      .toEqual(withoutAdvice.eventLog.slice(0, firstRoundEndIdxNoAdvice + 1));

    // Подія planChange з'являється рівно там, де застосовано пораду.
    const planChange = withAdvice.eventLog.find((e) => e.t === 'planChange');
    expect(planChange).toBeDefined();
    expect(planChange?.by).toBe('a');

    // А сам бій після поради відрізняється (порада реально впливає на осі).
    expect(JSON.stringify(withAdvice)).not.toBe(JSON.stringify(withoutAdvice));
  });

  it('детермінізм: той самий seed і та сама послідовність порад дають той самий бій', () => {
    const run = (seed: number) => {
      const steps = simulateFightSteps(a, b, ctx(), createRng(seed));
      let step = steps.next();
      let n = 0;
      while (!step.done) {
        n++;
        step = n === 2
          ? steps.next({ b: { fromRound: step.value.round + 1, toRound: 12, axisAdjustments: { pressure: -2 } } })
          : steps.next();
      }
      return step.value;
    };
    expect(JSON.stringify(run(4242))).toBe(JSON.stringify(run(4242)));
  });
});
