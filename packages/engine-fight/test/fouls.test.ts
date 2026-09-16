import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  simulateFight, buildRoundStats, TUNING, FOUL_KINDS, EMPTY_PLAN,
  type FightContext, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

/**
 * Фоли й зняття балів (ADR-0027). Подія `foul` — розширення наявного `FightEvent`,
 * тому тести перевіряють **правила**, а не розподіли: перше порушення типу — лише
 * попередження, друге й далі — пенальті; картка не опускається нижче межі; dirtiness
 * впливає на частоту; те саме дає той самий seed (ADR-0003).
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
const withDirtiness = (snap: FighterSnapshot, dirtiness: number): FighterSnapshot =>
  ({ ...snap, attributes: { ...snap.attributes, dirtiness } });

const world = generateWorld(4242, 200);
const a = toSnapshot(world.fighters[0] as Fighter);
const b = toSnapshot(world.fighters[1] as Fighter);
const seeds = [11, 777, 90210, 5150, 31337, 8, 99, 123456, 271828, 161803];
const outcomes = seeds.map((seed) => simulateFight(a, b, ctx(), createRng(seed)));

describe('фоли (ADR-0027)', () => {
  it('тип фолу — один із трьох дозволених', () => {
    for (const { eventLog } of outcomes) {
      for (const event of eventLog) {
        if (event.t !== 'foul') continue;
        expect(FOUL_KINDS).toContain(event.kind);
      }
    }
  });

  it('перший фол кожного типу за бійця — попередження; другий і далі — пенальті', () => {
    for (const { eventLog } of outcomes) {
      const seen = new Map<string, number>();
      for (const event of eventLog) {
        if (event.t !== 'foul') continue;
        const key = `${event.by}:${event.kind}`;
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        expect(event.penalized).toBe(count > 1);
      }
    }
  });

  it('картка раунду не опускається нижче межі TUNING.foulMinRoundScore навіть за кількох пенальті', () => {
    for (const { eventLog } of outcomes) {
      for (const event of eventLog) {
        if (event.t !== 'roundEnd') continue;
        for (const [scoreA, scoreB] of event.cards) {
          expect(scoreA).toBeGreaterThanOrEqual(TUNING.foulMinRoundScore);
          expect(scoreB).toBeGreaterThanOrEqual(TUNING.foulMinRoundScore);
        }
      }
    }
  });

  it('детермінізм: той самий seed дає той самий список фолів', () => {
    const foulsOf = (log: typeof outcomes[number]['eventLog']) => log.filter((e) => e.t === 'foul');
    const one = simulateFight(a, b, ctx(), createRng(2026));
    const two = simulateFight(a, b, ctx(), createRng(2026));
    expect(foulsOf(one.eventLog)).toEqual(foulsOf(two.eventLog));
  });

  it('вищий dirtiness дає частіші фоли на масовому прогоні', () => {
    const clean = withDirtiness(a, 1);
    const dirty = withDirtiness(a, 20);
    let cleanFouls = 0;
    let dirtyFouls = 0;
    for (let seed = 0; seed < 150; seed++) {
      cleanFouls += simulateFight(clean, b, ctx(), createRng(seed)).eventLog
        .filter((e) => e.t === 'foul' && e.by === 'a').length;
      dirtyFouls += simulateFight(dirty, b, ctx(), createRng(seed)).eventLog
        .filter((e) => e.t === 'foul' && e.by === 'a').length;
    }
    expect(dirtyFouls).toBeGreaterThan(cleanFouls);
  });

  it('зіткнення головами інколи дає розсічення в атакованого', () => {
    let headbuttCuts = 0;
    for (let seed = 0; seed < 150; seed++) {
      const { eventLog } = simulateFight(a, b, ctx(), createRng(seed));
      for (let i = 0; i < eventLog.length; i++) {
        const event = eventLog[i];
        if (event?.t !== 'foul' || event.kind !== 'headbutt') continue;
        const next = eventLog[i + 1];
        if (next?.t === 'cut' && next.round === event.round && next.on !== event.by) headbuttCuts++;
      }
    }
    expect(headbuttCuts).toBeGreaterThan(0);
  });

  it('round-stats: fouls/foulPenalties агрегуються на бік порушника, не потерпілого', () => {
    for (const { eventLog } of outcomes) {
      const rounds = buildRoundStats(eventLog);
      const byRoundBy = new Map<string, { fouls: number; penalties: number }>();
      for (const event of eventLog) {
        if (event.t !== 'foul') continue;
        const key = `${event.round}:${event.by}`;
        const acc = byRoundBy.get(key) ?? { fouls: 0, penalties: 0 };
        acc.fouls += 1;
        if (event.penalized) acc.penalties += 1;
        byRoundBy.set(key, acc);
      }
      for (const round of rounds) {
        for (const side of ['a', 'b'] as const) {
          const expected = byRoundBy.get(`${round.round}:${side}`) ?? { fouls: 0, penalties: 0 };
          expect(round[side].fouls).toBe(expected.fouls);
          expect(round[side].foulPenalties).toBe(expected.penalties);
        }
      }
    }
  });
});
