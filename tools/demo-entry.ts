import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import { SANCTIONING_BODIES } from '../packages/data/src/sanctioning-bodies.js';
import { CURRENCIES } from '../packages/data/src/currencies.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import { simulateFight, EMPTY_PLAN } from '../packages/engine-fight/src/index.js';
import { toSnapshot, makeJudges } from '../packages/sim-cli/src/calibrate.js';
import { buildWorld, runSeason } from '../packages/sim-cli/src/season.js';
import { saveCareer, loadCareer, describeSave } from '../packages/session/src/index.js';
import { buildTierIndex, formatIso, rankingKey } from '../packages/engine-world/src/index.js';
import {
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney,
} from '../packages/i18n/src/index.js';

// Подання лише відображає результати пакетів (ARCHITECTURE.md, інваріант 1).
declare global {
  interface Window { BM: unknown }
}

function runFight(a: unknown, b: unknown, seed: number): unknown {
  const rng = createRng(deriveSeed(seed, 'demo/fight'));
  const context = {
    scheduledRounds: 12, judges: makeJudges(rng),
    planA: EMPTY_PLAN, planB: EMPTY_PLAN, threeKnockdownRule: false,
  };
  return simulateFight(toSnapshot(a as never), toSnapshot(b as never), context as never, rng);
}

/** Останній прорахований світ — щоб його можна було зберегти у файл. */
let lastWorld: ReturnType<typeof buildWorld> | null = null;

function summarise(world: ReturnType<typeof buildWorld>, fightsHeld: number, byTier: Record<number, number>): unknown {
  const tiers = buildTierIndex(world);
  const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const tier of tiers.values()) counts[tier] = (counts[tier] ?? 0) + 1;
  const names: Record<string, string> = {};
  for (const f of Object.values(world.fighters)) names[f.id] = f.name;

  const shown = 'welterweight';
  const rankings = SANCTIONING_BODIES.map((body) => ({
    bodyId: body.id, characterKey: body.characterKey,
    rows: (world.rankings[rankingKey(body.id, shown)] ?? []).slice(0, 10)
      .map((r) => ({ position: r.position, name: names[r.fighterId] ?? '—', score: r.score })),
  }));

  return {
    day: world.day, date: formatIso(world.day), fightsHeld, byTier, tierCounts: counts,
    injured: Object.values(world.unavailableUntil).filter((d) => d > world.day).length,
    names, news: world.news.slice(-60).reverse(), rankings, rankedClass: shown,
  };
}

function simulateSeason(seed: number, fighters: number, days: number): unknown {
  const { world, fightsHeld, byTier } = runSeason(buildWorld(seed, fighters), days);
  lastWorld = world;
  return summarise(world, fightsHeld, byTier);
}

/**
 * Збереження у текст — той самий формат, що й у грі (ADR-0004).
 * Повертає і опис, щоб подання не рахувало його самостійно: світ для перегляду
 * і світ прорахованого сезону — різні, і плутати їх не можна.
 */
function exportCareer(): { text: string; summary: unknown } | null {
  if (!lastWorld) return null;
  const text = saveCareer(lastWorld);
  return { text, summary: describeSave(text) };
}

/** Відкриття сейву: помилки повертаються повідомленням, а не кидаються в UI. */
function importCareer(text: string): { ok: true; summary: unknown; season: unknown } | { ok: false; message: string } {
  try {
    const world = loadCareer(text);
    lastWorld = world;
    return { ok: true, summary: describeSave(text), season: summarise(world, 0, { 1: 0, 2: 0, 3: 0 }) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

window.BM = {
  generateWorld, WEIGHT_CLASSES, SANCTIONING_BODIES, CURRENCIES, STYLE_AXES, styleLabel,
  runFight, simulateSeason, exportCareer, importCareer, formatIso,
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney,
  groups: {
    technical: TECHNICAL_ATTRIBUTES, physical: PHYSICAL_ATTRIBUTES, mental: MENTAL_ATTRIBUTES,
  },
};
