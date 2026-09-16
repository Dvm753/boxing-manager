import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import {
  buildCommentary, simulateFight, EMPTY_PLAN,
  type FightContext, type FightEvent, type FighterSnapshot, type JudgeProfile,
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
const ctx = (): FightContext => ({
  scheduledRounds: 12,
  judges: [judge('j1'), judge('j2'), judge('j3')],
  planA: EMPTY_PLAN,
  planB: EMPTY_PLAN,
  threeKnockdownRule: false,
});

const world = generateWorld(4242, 200);
const a = toSnapshot(world.fighters[0] as Fighter);
const b = toSnapshot(world.fighters[1] as Fighter);

/** Кілька різних seed — щоб у вибірці були і зупинки, і рішення, і нокдауни. */
const logs = [11, 777, 90210, 5150, 31337].map(
  (seed) => simulateFight(a, b, ctx(), createRng(seed)).eventLog,
);

describe('коментар бою — похідна від EventLog', () => {
  it('той самий лог завжди дає той самий коментар', () => {
    for (const log of logs) {
      expect(buildCommentary(log)).toEqual(buildCommentary(log));
    }
  });

  it('коментар не вигадує раундів, яких не було в лозі', () => {
    for (const log of logs) {
      const rounds = new Set(log.filter((e) => e.t === 'roundStart').map((e) => e.round));
      for (const line of buildCommentary(log)) {
        if (line.round > 0) expect(rounds.has(line.round)).toBe(true);
      }
    }
  });

  it('підсумок раунду збігається з логом до удару', () => {
    const log = logs[0] as readonly FightEvent[];
    const lines = buildCommentary(log);
    for (const line of lines.filter((l) => l.key === 'commentary.roundSummary')) {
      const punches = log.filter((e) => e.t === 'punch' && e.round === line.round);
      const thrownA = punches.filter((e) => e.t === 'punch' && e.by === 'a').length;
      expect(line.params['thrownA']).toBe(thrownA);
      expect(line.params['thrownB']).toBe(punches.length - thrownA);
    }
  });

  it('не показує більше помітних ударів за раунд, ніж дозволено', () => {
    for (const log of logs) {
      const lines = buildCommentary(log, { notablePerRound: 2 });
      const perRound = new Map<number, number>();
      for (const line of lines) {
        if (!line.key.startsWith('commentary.land.')) continue;
        perRound.set(line.round, (perRound.get(line.round) ?? 0) + 1);
      }
      for (const count of perRound.values()) expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('критичне влучання наприкінці раунду витісняє чисті влучання на початку', () => {
    const log: readonly FightEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'punch', round: 1, second: 10, by: 'a', punch: 'jab', quality: 'clean', position: 'long' },
      { t: 'punch', round: 1, second: 40, by: 'a', punch: 'jab', quality: 'clean', position: 'long' },
      { t: 'punch', round: 1, second: 170, by: 'b', punch: 'hook', quality: 'critical', position: 'inside' },
      {
        t: 'roundEnd', round: 1, cards: [[9, 10], [9, 10], [9, 10]],
        staminaA: 80, staminaB: 78, headDamageA: 5, headDamageB: 12, bodyDamageA: 2, bodyDamageB: 1,
      },
    ];
    const lines = buildCommentary(log, { notablePerRound: 1, roundSummary: false });
    expect(lines.map((l) => l.key)).toEqual([
      'commentary.roundStart', 'commentary.land.critical', 'commentary.roundEnd',
    ]);
    expect(lines[1]?.keyParams).toEqual({ punch: 'punch.hook', position: 'position.inside' });
  });

  it('нокдаун, приголомшення і розсічення ніколи не відкидаються добіркою', () => {
    const log: readonly FightEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'punch', round: 1, second: 20, by: 'a', punch: 'cross', quality: 'heavy', position: 'mid' },
      { t: 'knockdown', round: 1, second: 20, by: 'a', count: 1 },
      { t: 'stun', round: 1, second: 20, on: 'b' },
      { t: 'cut', round: 1, second: 25, on: 'b', location: 'left-eye' },
      { t: 'planChange', round: 1, second: 100, by: 'b' },
      {
        t: 'roundEnd', round: 1, cards: [[10, 8], [10, 8], [10, 8]],
        staminaA: 75, staminaB: 60, headDamageA: 3, headDamageB: 20, bodyDamageA: 1, bodyDamageB: 4,
      },
    ];
    const keys = buildCommentary(log, { notablePerRound: 0 }).map((l) => l.key);
    expect(keys).toEqual([
      'commentary.roundStart', 'commentary.knockdown', 'commentary.stun',
      'commentary.cut', 'commentary.planChange', 'commentary.roundSummary', 'commentary.roundEnd',
    ]);
  });

  it('приголомшення показується раз на бійця за раунд, а не щоразу', () => {
    const roundEnd = (round: number): FightEvent => ({
      t: 'roundEnd', round, cards: [[10, 9], [10, 9], [10, 9]],
      staminaA: 80, staminaB: 82, headDamageA: 4, headDamageB: 6, bodyDamageA: 1, bodyDamageB: 1,
    });
    const log: readonly FightEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'stun', round: 1, second: 5, on: 'b' },
      { t: 'stun', round: 1, second: 30, on: 'b' },
      { t: 'stun', round: 1, second: 60, on: 'a' },
      roundEnd(1),
      { t: 'roundStart', round: 2 },
      { t: 'stun', round: 2, second: 15, on: 'b' },
      roundEnd(2),
    ];
    const stuns = buildCommentary(log).filter((l) => l.key === 'commentary.stun');
    expect(stuns.map((l) => `${l.round}${String(l.params['fighter'])}`)).toEqual(['1b', '1a', '2b']);
  });

  it('зупинка і рішення завершують коментар', () => {
    for (const log of logs) {
      const last = buildCommentary(log).at(-1);
      expect(last?.key.startsWith('commentary.stoppage.') || last?.key.startsWith('commentary.decision.')).toBe(true);
    }
  });

  it('нічия не називає переможця', () => {
    const lines = buildCommentary([
      { t: 'roundStart', round: 1 },
      { t: 'decision', kind: 'D', winner: null },
    ]);
    expect(lines.at(-1)).toEqual({ round: 1, second: null, key: 'commentary.decision.D', params: {} });
  });

  it('обірваний лог не мовчить: накопичене за раундом виводиться', () => {
    const lines = buildCommentary([
      { t: 'roundStart', round: 3 },
      { t: 'knockdown', round: 3, second: 90, by: 'a', count: 1 },
    ]);
    expect(lines.map((l) => l.key)).toContain('commentary.knockdown');
  });

  it('порожній лог дає порожній коментар', () => {
    expect(buildCommentary([])).toEqual([]);
  });
});

describe('коментар не містить тексту для людини (ADR-0017)', () => {
  const localeDir = join(process.cwd(), 'packages/i18n/src/locales');

  it('кожен ключ коментаря є в кожному словнику', () => {
    const keys = new Set<string>();
    for (const log of logs) {
      for (const line of buildCommentary(log)) {
        keys.add(line.key);
        for (const value of Object.values(line.keyParams ?? {})) keys.add(value);
      }
    }
    // Ключі, яких реальний бій може не породити: перевіряємо словники і на них.
    for (const extra of [
      'commentary.stoppage.ko', 'commentary.stoppage.tko', 'commentary.stoppage.rtd',
      'commentary.decision.UD', 'commentary.decision.SD', 'commentary.decision.MD',
      'commentary.decision.D', 'commentary.cut', 'commentary.stun', 'commentary.planChange',
      'cut.left-eye', 'cut.right-eye', 'cut.forehead',
      'position.out-of-range', 'position.long', 'position.mid',
      'position.inside', 'position.clinch', 'position.ropes',
      'punch.jab', 'punch.cross', 'punch.hook', 'punch.uppercut', 'punch.bodyShot',
    ]) keys.add(extra);

    const missing: string[] = [];
    for (const file of readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
      const dict = JSON.parse(readFileSync(join(localeDir, file), 'utf8')) as Record<string, string>;
      for (const key of keys) if (!(key in dict)) missing.push(`${file}: ${key}`);
    }
    expect(missing).toEqual([]);
  });
});
