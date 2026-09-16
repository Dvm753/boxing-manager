import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import { SANCTIONING_BODIES } from '../packages/data/src/sanctioning-bodies.js';
import { CURRENCIES } from '../packages/data/src/currencies.js';
import {
  CAMP_FOCUSES_BY_PHASE, CAMP_LOADS, CAMP_PHASES,
} from '../packages/data/src/camp-tuning.js';
import { FIGHT_PLANS } from '../packages/data/src/fight-plans.js';
import {
  STRATEGY_PLANS, STRATEGY_SCENARIOS, STRATEGY_PLAN_SUITABILITY, STRATEGY_SCENARIO_AXES,
  strategyBaseAxes, type StrategyPlanId, type StrategyScenarioId,
} from '../packages/data/src/strategy-plans.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import {
  simulateFight, simulateFightSteps, buildCommentary, buildRoundStats, totalStats, accuracy,
  proposeCornerAdvice, type FightStepUpdate,
} from '../packages/engine-fight/src/index.js';
import { coachSuitability } from '../packages/ai/src/index.js';
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

const SCHEDULED_ROUNDS = 12;

interface StrategyChoice { plan: StrategyPlanId; scenario: StrategyScenarioId }

/** Межа поради кута (ADR-0028) — магнітуда осей, яку дозволяє сам обраний сценарій. */
function scenarioBounds(scenario: StrategyScenarioId): { maxDelta: Record<string, number> } {
  const maxDelta: Record<string, number> = {};
  for (const [axis, delta] of Object.entries(STRATEGY_SCENARIO_AXES[scenario])) maxDelta[axis] = Math.abs(delta);
  return { maxDelta };
}

/**
 * Показовий бій. `take` — номер прогону: **той самий seed і ті самі бійці дають той самий
 * бій, але інший вечір — інший бій**. Це і є детермінізм ADR-0003: відтворюваність за
 * однакових входів, а не наперед визначений результат.
 *
 * `strategyA`/`strategyB` — план і сценарій A/B/C, обрані перед боєм (ADR-0028); задають
 * `FightPlan.baseAxes` і лишаються дійсними всю решту бою. Коли `advisorOn`, тренер
 * додатково пропонує обмежені поради між раундами через `simulateFightSteps` — приймаються
 * автоматично (демо не має паузи, це рівень перевірки механізму, не фінальний екран бою).
 */
function runFight(
  a: unknown, b: unknown, seed: number, take: number,
  strategyA: StrategyChoice, strategyB: StrategyChoice, advisorOn: boolean,
): unknown {
  const rng = createRng(deriveSeed(seed, `demo/fight/${take}`));
  const context = {
    scheduledRounds: SCHEDULED_ROUNDS, judges: makeJudges(rng),
    planA: { baseAxes: strategyBaseAxes(strategyA.plan, strategyA.scenario), blocks: [] },
    planB: { baseAxes: strategyBaseAxes(strategyB.plan, strategyB.scenario), blocks: [] },
    threeKnockdownRule: false,
  };
  const snapA = toSnapshot(a as never);
  const snapB = toSnapshot(b as never);

  if (!advisorOn) {
    return { ...simulateFight(snapA, snapB, context as never, rng), advice: [] };
  }

  const boundsA = scenarioBounds(strategyA.scenario);
  const boundsB = scenarioBounds(strategyB.scenario);
  const advice: { round: number; by: 'a' | 'b'; axisAdjustments: Record<string, number> }[] = [];

  const steps = simulateFightSteps(snapA, snapB, context as never, rng);
  let outcome = null as ReturnType<typeof simulateFight> | null;
  for (let step = steps.next(); ; ) {
    if (step.done) { outcome = step.value; break; }
    const boundary = step.value;
    const rounds = buildRoundStats(boundary.eventLog);
    const last = rounds[rounds.length - 1];
    const update: FightStepUpdate = {};
    if (last && last.staminaA !== null && last.staminaB !== null) {
      const fromRound = boundary.round + 1;
      const toRound = Math.min(SCHEDULED_ROUNDS, fromRound + 1);
      const adviceA = proposeCornerAdvice(last.a, last.b, last.staminaA, boundsA, fromRound, toRound);
      if (adviceA) { update.a = adviceA; advice.push({ round: boundary.round, by: 'a', axisAdjustments: adviceA.axisAdjustments }); }
      const adviceB = proposeCornerAdvice(last.b, last.a, last.staminaB, boundsB, fromRound, toRound);
      if (adviceB) { update.b = adviceB; advice.push({ round: boundary.round, by: 'b', axisAdjustments: adviceB.axisAdjustments }); }
    }
    step = steps.next(Object.keys(update).length ? update : undefined);
  }
  return { ...outcome, advice };
}

/** Придатність усіх трьох планів × трьох сценаріїв бійцю — текст поради тренера (ADR-0028). */
function coachAdvice(f: unknown, seed: number, coachSkill: number): unknown {
  const fighter = f as never;
  const rng = createRng(deriveSeed(seed, 'demo/coach'));
  const rows: { plan: StrategyPlanId; scenario: StrategyScenarioId; suitability: number }[] = [];
  for (const plan of STRATEGY_PLANS) {
    for (const scenario of STRATEGY_SCENARIOS) {
      rows.push({ plan, scenario, suitability: coachSuitability(fighter, plan, scenario, coachSkill, rng) });
    }
  }
  return rows;
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
  STRATEGY_PLANS, STRATEGY_SCENARIOS, STRATEGY_PLAN_SUITABILITY, coachAdvice,
  runFight, simulateSeason, exportCareer, importCareer, formatIso,
  buildCommentary, buildRoundStats, totalStats, accuracy, renderLine,
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney,
  groups: {
    technical: TECHNICAL_ATTRIBUTES, physical: PHYSICAL_ATTRIBUTES, mental: MENTAL_ATTRIBUTES,
  },
};
