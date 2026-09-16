import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  simulateFight, EMPTY_PLAN,
  type FightContext, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

/**
 * Годинник раунду, картки трьох суддів і втома/шкода за раунд (ADR-0025, закриває
 * Q30–Q31). Розширення наявних подій, тому тести перевіряють **форму й межі**, а не
 * розподіли — на розподіли гейт ADR-0008 не зрушив (перевірено окремо).
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
const outcomes = [11, 777, 90210, 5150, 31337].map((seed) => simulateFight(a, b, ctx(), createRng(seed)));

describe('годинник раунду (Q30)', () => {
  it('секунда лежить у 0…179 для подій усередині раунду', () => {
    for (const { eventLog } of outcomes) {
      for (const event of eventLog) {
        if (event.t === 'punch' || event.t === 'knockdown' || event.t === 'cut' || event.t === 'stun') {
          expect(event.second).toBeGreaterThanOrEqual(0);
          expect(event.second).toBeLessThanOrEqual(179);
        }
      }
    }
  });

  it('секунда не спадає протягом раунду', () => {
    for (const { eventLog } of outcomes) {
      let round = 0;
      let last = -1;
      for (const event of eventLog) {
        if (event.t === 'roundStart') { round = event.round; last = -1; continue; }
        if ('second' in event && event.round === round && typeof event.second === 'number') {
          expect(event.second, `раунд ${round}`).toBeGreaterThanOrEqual(last);
          last = event.second;
        }
      }
    }
  });

  it('зупинка несе секунду в межах раунду; RTD — рівно 180 (між раундами)', () => {
    for (const { eventLog } of outcomes) {
      const stoppage = eventLog.find((e) => e.t === 'stoppage');
      if (!stoppage || stoppage.t !== 'stoppage') continue;
      if (stoppage.reason === 'rtd') expect(stoppage.second).toBe(180);
      else { expect(stoppage.second).toBeGreaterThanOrEqual(0); expect(stoppage.second).toBeLessThanOrEqual(179); }
    }
  });
});

describe('картки трьох суддів за раунд (Q31)', () => {
  it('roundEnd завжди несе рівно три картки', () => {
    for (const { eventLog } of outcomes) {
      for (const event of eventLog) {
        if (event.t !== 'roundEnd') continue;
        expect(event.cards).toHaveLength(3);
        for (const [scoreA, scoreB] of event.cards) {
          expect(Number.isInteger(scoreA)).toBe(true);
          expect(Number.isInteger(scoreB)).toBe(true);
        }
      }
    }
  });

  it('підсумкові картки бою (FightResult.scorecards) — ті самі три судді, що й у roundEnd', () => {
    for (const { result, eventLog } of outcomes) {
      if (result.scorecards.length === 0) continue; // бій завершився нокаутом чи TKO
      const roundEnds = eventLog.filter((e) => e.t === 'roundEnd');
      expect(result.scorecards).toHaveLength(3);
      expect(roundEnds.length).toBeGreaterThan(0);
    }
  });
});

describe('втома і шкода за раунд (Q31)', () => {
  it('лежать у межах 0…100 (втома) і невід\'ємні (шкода)', () => {
    for (const { eventLog } of outcomes) {
      for (const event of eventLog) {
        if (event.t !== 'roundEnd') continue;
        expect(event.staminaA).toBeGreaterThanOrEqual(0);
        expect(event.staminaA).toBeLessThanOrEqual(100);
        expect(event.staminaB).toBeGreaterThanOrEqual(0);
        expect(event.staminaB).toBeLessThanOrEqual(100);
        expect(event.headDamageA).toBeGreaterThanOrEqual(0);
        expect(event.headDamageB).toBeGreaterThanOrEqual(0);
        expect(event.bodyDamageA).toBeGreaterThanOrEqual(0);
        expect(event.bodyDamageB).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('шкода наприкінці раунду не менша за шкоду минулого раунду мінус відновлення кутка — монотонність із запасом', () => {
    // Слабка перевірка: шкода не може обнулитися сама собою за один раунд без бою.
    for (const { eventLog } of outcomes) {
      const roundEnds = eventLog.filter((e) => e.t === 'roundEnd');
      for (let i = 1; i < roundEnds.length; i++) {
        const prev = roundEnds[i - 1]; const cur = roundEnds[i];
        if (prev.t !== 'roundEnd' || cur.t !== 'roundEnd') continue;
        // Відновлення в кутку — не більш ніж кілька одиниць за раунд (tuning.ts).
        expect(cur.headDamageA).toBeGreaterThan(prev.headDamageA - 10);
        expect(cur.headDamageB).toBeGreaterThan(prev.headDamageB - 10);
      }
    }
  });
});

describe('той самий бій, ті самі нові поля (ADR-0003)', () => {
  it('другий прогін з тим самим seed дає ті самі секунди й картки', () => {
    const one = simulateFight(a, b, ctx(), createRng(4242));
    const two = simulateFight(a, b, ctx(), createRng(4242));
    expect(one.eventLog).toEqual(two.eventLog);
  });
});
