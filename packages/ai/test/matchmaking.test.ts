import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import { assessOffer, careerStage, makeCandidate, proposeCard, type MatchCandidate } from '../src/index.js';

const world = generateWorld(2026, 1200);
const byAbility = [...world.fighters].sort((a, b) => {
  const av = Object.values(a.attributes).reduce((s, x) => s + x, 0);
  const bv = Object.values(b.attributes).reduce((s, x) => s + x, 0);
  return bv - av;
});

const ranked = (f: Fighter, position: number | null, lastFightDay: number | null = 100): MatchCandidate =>
  makeCandidate(f, [{ bodyId: 'gbc', position }], lastFightDay, true);

const strong = byAbility[0] as Fighter;
const weak = byAbility[byAbility.length - 1] as Fighter;
const middling = byAbility[Math.floor(byAbility.length / 2)] as Fighter;

describe('стадія кар\'єри', () => {
  it('топ-3 рейтингу — чемпіон, топ-15 — претендент', () => {
    expect(careerStage(ranked(strong, 1))).toBe('champion');
    expect(careerStage(ranked(strong, 9))).toBe('contender');
  });

  it('поза рейтингом і молодий — перспективний', () => {
    const young: Fighter = { ...middling, age: 22, wear: { ...middling.wear, headTrauma: 5 },
      record: { wins: 8, losses: 0, draws: 0, knockouts: 4 } };
    expect(careerStage(ranked(young, null))).toBe('prospect');
  });

  it('вік або накопичений знос роблять ветераном', () => {
    const old: Fighter = { ...middling, age: 35 };
    expect(careerStage(ranked(old, null))).toBe('veteran');
    const worn: Fighter = { ...middling, age: 28, wear: { ...middling.wear, headTrauma: 70 } };
    expect(careerStage(ranked(worn, null))).toBe('veteran');
  });
});

describe('оцінка пропозиції', () => {
  it('перспективного бережуть: небезпечний бій відхиляється', () => {
    const prospect: Fighter = { ...middling, age: 21, wear: { ...middling.wear, headTrauma: 3 },
      record: { wins: 6, losses: 0, draws: 0, knockouts: 3 } };
    const offer = assessOffer(ranked(prospect, null, 150), ranked(strong, 2), 160);
    expect(offer.winChance).toBeLessThan(0.5);
    expect(offer.accept).toBe(false);
  });

  it('джорнимен погоджується там, де перспективний відмовляється', () => {
    const base: Fighter = { ...middling, age: 29,
      record: { wins: 8, losses: 14, draws: 1, knockouts: 2 } };
    const journeyman = ranked(base, null, 150);
    expect(careerStage(journeyman)).toBe('journeyman');
    const prospect = ranked({ ...middling, age: 21, wear: { ...middling.wear, headTrauma: 2 },
      record: { wins: 6, losses: 0, draws: 0, knockouts: 3 } }, null, 150);
    const versus = ranked(strong, 2);
    expect(assessOffer(journeyman, versus, 160).accept).toBe(true);
    expect(assessOffer(prospect, versus, 160).accept).toBe(false);
  });

  it('перемога над вищим за рейтингом коштує більше', () => {
    const self = ranked(middling, 12);
    const higher = assessOffer(self, ranked(strong, 2), 160);
    const lower = assessOffer(self, ranked(weak, null), 160);
    expect(higher.reward).toBeGreaterThan(lower.reward);
  });

  it('простій підвищує готовність битися', () => {
    const fresh = assessOffer(ranked(middling, 10, 150), ranked(strong, 3), 160);
    const idle = assessOffer(ranked(middling, 10, null), ranked(strong, 3), 160);
    expect(idle.inactivityPressure).toBeGreaterThan(fresh.inactivityPressure);
    expect(idle.score).toBeGreaterThan(fresh.score);
  });

  it('недоступний боєць не погоджується ніколи', () => {
    const injured = makeCandidate(middling, [{ bodyId: 'gbc', position: 5 }], 100, false);
    expect(assessOffer(injured, ranked(weak, null), 160).accept).toBe(false);
    expect(assessOffer(ranked(weak, null), injured, 160).accept).toBe(false);
  });
});

describe('матчмейкінг', () => {
  const candidates = world.fighters.map((f, i) =>
    makeCandidate(f, [{ bodyId: 'gbc', position: i < 15 ? i + 1 : null }], i % 3 === 0 ? null : 120, true));

  it('детермінований при тому самому seed', () => {
    const a = proposeCard(candidates, { day: 200, rng: createRng(7) });
    const b = proposeCard(candidates, { day: 200, rng: createRng(7) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('жоден боєць не потрапляє на картку двічі', () => {
    const card = proposeCard(candidates, { day: 200, rng: createRng(3) }, { targetBouts: 20 });
    const seen = new Set<string>();
    for (const bout of card) {
      expect(seen.has(bout.aId)).toBe(false);
      expect(seen.has(bout.bId)).toBe(false);
      seen.add(bout.aId);
      seen.add(bout.bId);
    }
  });

  it('суперники завжди з однієї вагової категорії', () => {
    const byId = new Map(world.fighters.map((f) => [f.id, f]));
    for (const bout of proposeCard(candidates, { day: 200, rng: createRng(5) }, { targetBouts: 20 })) {
      expect(byId.get(bout.aId)?.constants.naturalWeightClassId)
        .toBe(byId.get(bout.bId)?.constants.naturalWeightClassId);
    }
  });

  it('бій виникає лише за згодою обох — односторонньої згоди замало', () => {
    for (const bout of proposeCard(candidates, { day: 200, rng: createRng(11) }, { targetBouts: 15 })) {
      const a = candidates.find((c) => c.fighter.id === bout.aId) as MatchCandidate;
      const b = candidates.find((c) => c.fighter.id === bout.bId) as MatchCandidate;
      expect(assessOffer(a, b, 200).accept).toBe(true);
      expect(assessOffer(b, a, 200).accept).toBe(true);
    }
  });

  it('недоступні бійці не потрапляють у картку', () => {
    const half = candidates.map((c, i) => (i % 2 === 0 ? { ...c, available: false } : c));
    const blocked = new Set(half.filter((c) => !c.available).map((c) => c.fighter.id));
    for (const bout of proposeCard(half, { day: 200, rng: createRng(13) }, { targetBouts: 20 })) {
      expect(blocked.has(bout.aId)).toBe(false);
      expect(blocked.has(bout.bId)).toBe(false);
    }
  });
});
