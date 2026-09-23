import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  simulateFight, buildFightSummary, buildRoundStats, totalStats, EMPTY_PLAN,
  type FightContext, type FightEvent, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

/**
 * Резюме бою — похідна від `EventLog`: перевіряємо, що воно **узгоджене з самим логом
 * і з результатом рушія**, а не вгадуємо «правильний» опис.
 */
const toSnapshot = (f: Fighter): FighterSnapshot => ({
  id: f.id, attributes: f.attributes, styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm, reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness, freshness: f.condition.freshness, headTrauma: f.wear.headTrauma,
});
const judge = (id: string): JudgeProfile =>
  ({ id, cleanPunching: 1.2, aggression: 0.8, ringGeneralship: 0.7, defence: 0.5, bias: 0 });
const ctx = (): FightContext => ({
  scheduledRounds: 12, judges: [judge('j1'), judge('j2'), judge('j3')],
  planA: EMPTY_PLAN, planB: EMPTY_PLAN, threeKnockdownRule: false,
});
const world = generateWorld(31337, 120);

const card = (round: number, cards: [number, number][]): FightEvent => ({
  t: 'roundEnd', round, cards, staminaA: 80, staminaB: 80,
  headDamageA: 0, headDamageB: 0, bodyDamageA: 0, bodyDamageB: 0,
});

describe('резюме бою', () => {
  it('переможець, метод і раунд збігаються з результатом рушія на 80 боях', () => {
    for (let seed = 0; seed < 80; seed++) {
      const a = world.fighters[seed % 40] as Fighter;
      const b = world.fighters[40 + (seed % 40)] as Fighter;
      const out = simulateFight(toSnapshot(a), toSnapshot(b), ctx(), createRng(seed));
      const summary = buildFightSummary(out.eventLog);
      expect(summary.winner).toBe(out.result.winner);
      expect(summary.method).toBe(out.result.method);
      expect(summary.endingRound).toBe(out.result.endingRound);
      expect(summary.totals).toEqual(totalStats(buildRoundStats(out.eventLog)));
    }
  });

  it('нокдауни в моментах — рівно ті, що в статистиці', () => {
    for (let seed = 0; seed < 40; seed++) {
      const out = simulateFight(
        toSnapshot(world.fighters[seed] as Fighter), toSnapshot(world.fighters[seed + 60] as Fighter),
        ctx(), createRng(seed),
      );
      const s = buildFightSummary(out.eventLog);
      const kd = s.moments.filter((m) => m.kind === 'knockdown');
      expect(kd.length).toBe(s.totals.a.knockdowns + s.totals.b.knockdowns);
    }
  });

  it('раунди рахуються за більшістю суддів; домінування — від двох третин', () => {
    const log: FightEvent[] = [
      { t: 'roundStart', round: 1 }, card(1, [[10, 9], [10, 9], [9, 10]]),
      { t: 'roundStart', round: 2 }, card(2, [[10, 9], [10, 9], [10, 9]]),
      { t: 'roundStart', round: 3 }, card(3, [[10, 10], [10, 10], [10, 9]]),
      { t: 'decision', kind: 'UD', winner: 'a' },
    ];
    const s = buildFightSummary(log);
    expect(s.roundsWon).toEqual({ a: 2, b: 0, even: 1 });
    expect(s.dominant).toBe('a');
    expect(s.comeback).toBe(false);
  });

  it('перелом: переможець відставав на два раунди', () => {
    const b = (r: number): FightEvent[] => [{ t: 'roundStart', round: r }, card(r, [[9, 10], [9, 10], [9, 10]])];
    const a = (r: number): FightEvent[] => [{ t: 'roundStart', round: r }, card(r, [[10, 9], [10, 9], [10, 9]])];
    const log: FightEvent[] = [
      ...b(1), ...b(2), ...a(3), ...a(4),
      { t: 'roundStart', round: 5 },
      { t: 'knockdown', round: 5, second: 40, by: 'a', count: 1 },
      { t: 'stoppage', round: 5, second: 70, winner: 'a', reason: 'tko' },
    ];
    const s = buildFightSummary(log);
    expect(s.winner).toBe('a');
    expect(s.method).toBe('TKO');
    expect(s.endingRound).toBe(5);
    expect(s.comeback).toBe(true);
    expect(s.dominant).toBeNull();
    expect(s.moments.map((m) => m.kind)).toEqual(['knockdown', 'stoppage']);
  });

  it('фол: попередження й знятий бал розрізняються', () => {
    const log: FightEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'foul', round: 1, second: 10, by: 'b', kind: 'low-blow', penalized: false },
      { t: 'foul', round: 1, second: 90, by: 'b', kind: 'low-blow', penalized: true },
      { t: 'cut', round: 1, second: 100, on: 'a', location: 'left-eye' },
      card(1, [[10, 8], [10, 8], [10, 8]]),
      { t: 'decision', kind: 'D', winner: null },
    ];
    const s = buildFightSummary(log);
    expect(s.moments.map((m) => m.kind)).toEqual(['warning', 'deduction', 'cut']);
    expect(s.winner).toBeNull();
    expect(s.comeback).toBe(false);
  });
});
