import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import { simulateFight, EMPTY_PLAN } from '../packages/engine-fight/src/index.js';
import { toSnapshot, makeJudges } from '../packages/sim-cli/src/calibrate.js';
import { buildWorld, runSeason } from '../packages/sim-cli/src/season.js';
import { buildTierIndex, formatIso, rankingKey } from '../packages/engine-world/src/index.js';
import { SANCTIONING_BODIES } from '../packages/data/src/index.js';
import { createTranslator, LOCALES, LOCALE_NAMES } from '../packages/i18n/src/index.js';

// Подання лише відображає результати пакетів (ARCHITECTURE.md, інваріант 1).
declare global {
  interface Window { BM: unknown }
}

function runFight(a: unknown, b: unknown, seed: number): unknown {
  const rng = createRng(deriveSeed(seed, 'demo/fight'));
  const context = {
    scheduledRounds: 12,
    judges: makeJudges(rng),
    planA: EMPTY_PLAN,
    planB: EMPTY_PLAN,
    threeKnockdownRule: false,
  };
  return simulateFight(
    toSnapshot(a as never), toSnapshot(b as never), context as never, rng,
  );
}

function simulateSeason(seed: number, fighters: number, days: number): unknown {
  const start = buildWorld(seed, fighters);
  const { world, fightsHeld, byTier } = runSeason(start, days);
  const tiers = buildTierIndex(world);
  const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const tier of tiers.values()) counts[tier] = (counts[tier] ?? 0) + 1;
  const names: Record<string, string> = {};
  for (const f of Object.values(world.fighters)) names[f.id] = f.name;
  const injured = Object.entries(world.unavailableUntil).filter(([, until]) => until > world.day).length;
  // Рейтинги однієї показової категорії за версіями всіх чотирьох органів.
  const shown = 'welterweight';
  const rankings = SANCTIONING_BODIES.map((body) => ({
    bodyId: body.id,
    characterKey: body.characterKey,
    rows: (world.rankings[rankingKey(body.id, shown)] ?? []).slice(0, 10)
      .map((r) => ({ position: r.position, name: names[r.fighterId] ?? '—', score: r.score })),
  }));

  return {
    day: world.day, date: formatIso(world.day), fightsHeld, byTier, tierCounts: counts, injured, names,
    news: world.news.slice(-40).reverse(), rankings, rankedClass: shown,
  };
}

window.BM = {
  SANCTIONING_BODIES,
  generateWorld, WEIGHT_CLASSES, STYLE_AXES, styleLabel, runFight, simulateSeason, formatIso,
  createTranslator, LOCALES, LOCALE_NAMES,
  groups: {
    technical: TECHNICAL_ATTRIBUTES,
    physical: PHYSICAL_ATTRIBUTES,
    mental: MENTAL_ATTRIBUTES,
  },
};
