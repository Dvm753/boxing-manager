import { describe, it, expect } from 'vitest';
import { createRng } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import type { Fighter } from '@bm/core-model';
import {
  simulateFight, EMPTY_PLAN, LAND_QUALITIES,
  type FightContext, type FighterSnapshot, type JudgeProfile,
} from '../src/index.js';

const toSnapshot = (f: Fighter): FighterSnapshot => ({
  id: f.id,
  attributes: f.attributes,
  styleAxes: f.styleAxes,
  heightCm: f.constants.heightCm,
  reachCm: f.constants.reachCm,
  sharpness: f.condition.sharpness,
  freshness: f.condition.freshness,
  headTrauma: f.wear.headTrauma,
});

const judge = (id: string): JudgeProfile => ({
  id, cleanPunching: 1.2, aggression: 0.8, ringGeneralship: 0.7, defence: 0.5, bias: 0,
});
const makeJudges = (): FightContext['judges'] => [judge('j1'), judge('j2'), judge('j3')];

const world = generateWorld(4242, 200);
const a = toSnapshot(world.fighters[0]!);
const b = toSnapshot(world.fighters[1]!);

const ctx = (): FightContext => ({
  scheduledRounds: 12,
  judges: makeJudges(),
  planA: EMPTY_PLAN,
  planB: EMPTY_PLAN,
  threeKnockdownRule: false,
});

describe('детермінізм рушія бою (ADR-0003)', () => {
  it('той самий seed дає байт-ідентичний EventLog', () => {
    const one = simulateFight(a, b, ctx(), createRng(777));
    const two = simulateFight(a, b, ctx(), createRng(777));
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it('1000 боїв із фіксованими seed відтворюються повністю', () => {
    const run = (): string => {
      const rng = createRng(31337);
      const out: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const x = toSnapshot(world.fighters[rng.int(0, 199)]!);
        const y = toSnapshot(world.fighters[rng.int(0, 199)]!);
        const { result } = simulateFight(x, y, ctx(), rng);
        out.push(`${result.method}:${result.winner}:${result.endingRound}`);
      }
      return out.join('|');
    };
    expect(run()).toBe(run());
  });

  it('інший seed дає інший бій', () => {
    const one = simulateFight(a, b, ctx(), createRng(1));
    const two = simulateFight(a, b, ctx(), createRng(2));
    expect(JSON.stringify(one)).not.toBe(JSON.stringify(two));
  });

  it('рушій не мутує зліпок бійця', () => {
    const before = JSON.stringify(a);
    simulateFight(a, b, ctx(), createRng(9));
    expect(JSON.stringify(a)).toBe(before);
  });
});

describe('контракт EventLog (ADR-0012)', () => {
  it('кожна подія удару має градацію з переліку', () => {
    const { eventLog } = simulateFight(a, b, ctx(), createRng(55));
    for (const e of eventLog) {
      if (e.t === 'punch') expect(LAND_QUALITIES).toContain(e.quality);
    }
  });

  it('статистика «влучено» дорівнює кількості подій partial і вище', () => {
    const { result, eventLog } = simulateFight(a, b, ctx(), createRng(56));
    const landedA = eventLog.filter(
      (e) => e.t === 'punch' && e.by === 'a' && !['miss', 'block'].includes(e.quality),
    ).length;
    expect(result.statsA.landed).toBe(landedA);
  });

  it('лог містить раунд завершення, навіть якщо тесту на M2 ще немає (ADR-0009)', () => {
    const { result, eventLog } = simulateFight(a, b, ctx(), createRng(57));
    const last = eventLog[eventLog.length - 1]!;
    if (last.t === 'stoppage') expect(last.round).toBe(result.endingRound);
    else expect(result.endingRound).toBe(12);
  });

  it('нокдауни потрапляють у лог і в статистику', () => {
    let logged = 0;
    let counted = 0;
    const rng = createRng(4);
    for (let i = 0; i < 120; i++) {
      const x = toSnapshot(world.fighters[rng.int(0, 199)]!);
      const y = toSnapshot(world.fighters[rng.int(0, 199)]!);
      const { result, eventLog } = simulateFight(x, y, ctx(), rng);
      logged += eventLog.filter((e) => e.t === 'knockdown').length;
      counted += result.statsA.knockdowns + result.statsB.knockdowns;
    }
    expect(logged).toBe(counted);
    expect(logged).toBeGreaterThan(0);
  });
});
