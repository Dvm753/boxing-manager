import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  accuracy, buildRoundStats, totalStats, simulateFight, EMPTY_PLAN,
  type FightContext, type FightEvent, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

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
const outcomes = [11, 777, 90210, 5150].map((seed) => simulateFight(a, b, ctx(), createRng(seed)));

describe('статистика за раундами — похідна від EventLog', () => {
  it('сума раундів збігається з підсумком бою з рушія', () => {
    for (const { result, eventLog } of outcomes) {
      const total = totalStats(buildRoundStats(eventLog));
      expect(total.a.thrown).toBe(result.statsA.thrown);
      expect(total.a.landed).toBe(result.statsA.landed);
      expect(total.b.thrown).toBe(result.statsB.thrown);
      expect(total.b.landed).toBe(result.statsB.landed);
    }
  });

  it('нокдауни за раундами збігаються з підсумковими', () => {
    for (const { result, eventLog } of outcomes) {
      const total = totalStats(buildRoundStats(eventLog));
      expect(total.a.knockdowns).toBe(result.statsA.knockdowns);
      expect(total.b.knockdowns).toBe(result.statsB.knockdowns);
    }
  });

  it('раунди йдуть підряд і закінчуються раундом завершення бою', () => {
    for (const { result, eventLog } of outcomes) {
      const rounds = buildRoundStats(eventLog);
      expect(rounds.map((r) => r.round)).toEqual(
        Array.from({ length: result.endingRound }, (_, i) => i + 1),
      );
      expect(rounds.at(-1)?.finished).toBe(true);
    }
  });

  it('сильні влучання не перевищують загальних влучань', () => {
    for (const { eventLog } of outcomes) {
      for (const round of buildRoundStats(eventLog)) {
        expect(round.a.power).toBeLessThanOrEqual(round.a.landed);
        expect(round.b.power).toBeLessThanOrEqual(round.b.landed);
      }
    }
  });

  it('розсічення і приголомшення записуються тому, хто їх отримав', () => {
    const log: readonly FightEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'punch', round: 1, by: 'a', punch: 'hook', quality: 'heavy', position: 'mid' },
      { t: 'cut', round: 1, on: 'b', location: 'left-eye' },
      { t: 'stun', round: 1, on: 'b' },
      { t: 'knockdown', round: 1, by: 'a', count: 1 },
      { t: 'roundEnd', round: 1, scoreA: 10, scoreB: 8 },
    ];
    const [round] = buildRoundStats(log);
    expect(round?.a).toMatchObject({ thrown: 1, landed: 1, power: 1, knockdowns: 1, cuts: 0, stuns: 0 });
    expect(round?.b).toMatchObject({ thrown: 0, cuts: 1, stuns: 1, knockdowns: 0 });
    expect(round?.scoreA).toBe(10);
  });

  it('точність без кинутих ударів — нуль, а не NaN', () => {
    expect(accuracy({ thrown: 0, landed: 0, power: 0, knockdowns: 0, cuts: 0, stuns: 0 })).toBe(0);
    expect(accuracy({ thrown: 50, landed: 20, power: 5, knockdowns: 0, cuts: 0, stuns: 0 })).toBe(40);
  });

  it('порожній лог дає порожню статистику', () => {
    expect(buildRoundStats([])).toEqual([]);
    expect(totalStats([]).a.thrown).toBe(0);
  });
});
