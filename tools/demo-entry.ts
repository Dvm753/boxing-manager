import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import { SANCTIONING_BODIES } from '../packages/data/src/sanctioning-bodies.js';
import { CURRENCIES } from '../packages/data/src/currencies.js';
import {
  CAMP_FOCUSES_BY_PHASE, CAMP_LOADS, CAMP_PHASES,
} from '../packages/data/src/camp-tuning.js';
import { FIGHT_PLANS } from '../packages/data/src/fight-plans.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import {
  simulateFight, EMPTY_PLAN, buildCommentary, buildRoundStats, totalStats, accuracy,
} from '../packages/engine-fight/src/index.js';
import { toSnapshot, makeJudges } from '../packages/sim-cli/src/calibrate.js';
import { buildWorld, runSeason } from '../packages/sim-cli/src/season.js';
import {
  saveCareer, loadCareer, describeSave, startCareer, playerStable,
} from '../packages/session/src/index.js';
import { buildTierIndex, formatIso, rankingKey, nextFightIndex } from '../packages/engine-world/src/index.js';
import {
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney, renderLine,
} from '../packages/i18n/src/index.js';

// Подання лише відображає результати пакетів (ARCHITECTURE.md, інваріант 1).
declare global {
  interface Window { BM: unknown }
}

/**
 * Показовий бій. `take` — номер прогону: **той самий seed і ті самі бійці дають той самий
 * бій, але інший вечір — інший бій**. Це і є детермінізм ADR-0003: відтворюваність за
 * однакових входів, а не наперед визначений результат.
 */
function runFight(a: unknown, b: unknown, seed: number, take = 0): unknown {
  const rng = createRng(deriveSeed(seed, `demo/fight/${take}`));
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
  const rankings = SANCTIONING_BODIES.map((body) => {
    const key = rankingKey(body.id, shown);
    const championId = world.titles[key]?.championId ?? null;
    return {
      bodyId: body.id, characterKey: body.characterKey,
      champion: championId === null ? null : (names[championId] ?? '—'),
      defences: world.titles[key]?.defences ?? 0,
      rows: (world.rankings[key] ?? []).slice(0, 10)
        .map((r) => ({ position: r.position, name: names[r.fighterId] ?? '—', score: r.score })),
    };
  });

  // Форма світу (ADR-0022): видно, що вона справді жива, а не задана при генерації.
  const schedule = nextFightIndex(world);
  const all = Object.values(world.fighters);
  const sharpness = all.map((f) => f.condition.sharpness);
  const camp = all
    .filter((f) => {
      const next = schedule.get(f.id);
      return next !== undefined && next.day > world.day && next.day - world.day <= 56;
    })
    .map((f) => ({
      name: f.name,
      sharpness: f.condition.sharpness,
      freshness: f.condition.freshness,
      daysToFight: (schedule.get(f.id) as { day: number }).day - world.day,
    }))
    .sort((x, y) => x.daysToFight - y.daysToFight)
    .slice(0, 10);

  return {
    day: world.day, date: formatIso(world.day), fightsHeld, byTier, tierCounts: counts,
    fighters: Object.keys(world.fighters).length,
    injured: Object.values(world.unavailableUntil).filter((d) => d > world.day).length,
    names, news: world.news.slice(-60).reverse(), rankings, rankedClass: shown,
    // Титульних новин мало порівняно зі звичайними (ADR-0026: одиниці відсотків боїв),
    // тож у загальній стрічці за 60 останніх подій вони губляться в багатому світі.
    // Власна вибірка — тим самим світом, без додаткового джерела правди.
    titleNews: world.news.filter((n) => n.key.startsWith('news.title')).slice(-20).reverse(),
    stable: playerStable(world).map((view) => ({
      ...view,
      name: names[view.fighterId] ?? '—',
      nextFight: view.nextFight === null ? null : {
        ...view.nextFight,
        opponentName: names[view.nextFight.opponentId] ?? '—',
        date: formatIso(view.nextFight.day),
      },
      recentFights: view.recentFights.map((f) => ({
        ...f, opponentName: names[f.opponentId] ?? '—', date: formatIso(f.day),
      })),
    })),
    condition: {
      avgSharpness: sharpness.reduce((a, b) => a + b, 0) / (sharpness.length || 1),
      minSharpness: Math.min(...sharpness),
      maxSharpness: Math.max(...sharpness),
      inCamp: all.filter((f) => {
        const next = schedule.get(f.id);
        return next !== undefined && next.day > world.day && next.day - world.day <= 56;
      }).length,
      camp,
    },
  };
}

/**
 * Прогін кар'єри. Світ той самий, що й для перегляду — `createWorld(seed, n)` бере
 * `generateWorld(seed, n)`, тому id бійця зі списку дійсний і тут. Плутанина двох
 * різних світів уже одного разу дала неправильний рядок у збереженні.
 */
function simulateSeason(
  seed: number, fighters: number, days: number, playerIds?: readonly string[], policy?: unknown,
): unknown {
  const base = buildWorld(seed, fighters);
  // Стайбл, а не один боєць (ADR-0024): рішень стає стільки, скільки підопічних.
  let start = base;
  for (const id of playerIds ?? []) start = startCareer(start, id);
  const season = runSeason(start, days, undefined, policy as never);
  lastWorld = season.world;
  return {
    ...(summarise(season.world, season.fightsHeld, season.byTier) as object),
    decisionsMade: season.decisionsMade,
  };
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
  CAMP_PHASES, CAMP_LOADS, CAMP_FOCUSES_BY_PHASE, FIGHT_PLANS,
  runFight, simulateSeason, exportCareer, importCareer, formatIso,
  buildCommentary, buildRoundStats, totalStats, accuracy, renderLine,
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney,
  groups: {
    technical: TECHNICAL_ATTRIBUTES, physical: PHYSICAL_ATTRIBUTES, mental: MENTAL_ATTRIBUTES,
  },
};
