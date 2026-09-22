import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  simulateFight, EMPTY_PLAN, buildCommentary,
  type FightContext, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

/**
 * Коронні прийоми атаки (Q34) у бою: рушій лише читає готовий список від
 * `@bm/core-model` (`FighterState.signatures`), тому тут перевіряється не поріг
 * активації (те тестує `core-model`), а що прийом реально зсуває розподіл ударів
 * і не ламає детермінізм.
 */
const toSnapshot = (f: Fighter, overrideAttrs?: Partial<Fighter['attributes']>): FighterSnapshot => ({
  id: f.id,
  attributes: overrideAttrs ? { ...f.attributes, ...overrideAttrs } : f.attributes,
  styleAxes: f.styleAxes, heightCm: f.constants.heightCm, reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness, freshness: f.condition.freshness, headTrauma: f.wear.headTrauma,
});
const judge = (id: string): JudgeProfile =>
  ({ id, cleanPunching: 1.2, aggression: 0.8, ringGeneralship: 0.7, defence: 0.5, bias: 0 });
const ctx = (): FightContext => ({
  scheduledRounds: 12, judges: [judge('j1'), judge('j2'), judge('j3')],
  planA: EMPTY_PLAN, planB: EMPTY_PLAN, threeKnockdownRule: false,
});

const world = generateWorld(4242, 200);
const opponent = world.fighters[1] as Fighter;

describe('коронні прийоми атаки в бою (Q34)', () => {
  it('джеб-спеціаліст кидає й влучає джебом помітно частіше за рівний профіль', () => {
    const base = world.fighters[0] as Fighter;
    const even = toSnapshot(base, { jab: 10, cross: 10, hook: 10, uppercut: 10, bodyPunching: 10 });
    const jabber = toSnapshot(base, { jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8 });
    const b = toSnapshot(opponent);

    let evenJabs = 0, evenTotal = 0, jabberJabs = 0, jabberTotal = 0;
    for (let seed = 0; seed < 60; seed++) {
      const outEven = simulateFight(even, b, ctx(), createRng(seed));
      const outJabber = simulateFight(jabber, b, ctx(), createRng(seed));
      for (const e of outEven.eventLog) if (e.t === 'punch' && e.by === 'a') { evenTotal++; if (e.punch === 'jab') evenJabs++; }
      for (const e of outJabber.eventLog) if (e.t === 'punch' && e.by === 'a') { jabberTotal++; if (e.punch === 'jab') jabberJabs++; }
    }
    expect(jabberJabs / jabberTotal).toBeGreaterThan(evenJabs / evenTotal);
  });

  it('той самий seed дає той самий лог — прийоми не додають випадковості', () => {
    const base = world.fighters[0] as Fighter;
    const jabber = toSnapshot(base, { jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8 });
    const b = toSnapshot(opponent);
    const one = simulateFight(jabber, b, ctx(), createRng(777));
    const two = simulateFight(jabber, b, ctx(), createRng(777));
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it('коронні удари не породжують нових ключів коментаря поза наявним словником', () => {
    const base = world.fighters[0] as Fighter;
    const jabber = toSnapshot(base, { jab: 18, cross: 8, hook: 8, uppercut: 8, bodyPunching: 8 });
    const b = toSnapshot(opponent);
    for (let seed = 0; seed < 10; seed++) {
      const out = simulateFight(jabber, b, ctx(), createRng(seed));
      expect(() => buildCommentary(out.eventLog)).not.toThrow();
    }
  });
});
