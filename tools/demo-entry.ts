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
  STRATEGY_SCENARIO_ADVICE_BOUNDS,
  strategyBaseAxes, type StrategyPlanId, type StrategyScenarioId,
} from '../packages/data/src/strategy-plans.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel, type StyleAxes, type StyleAxis } from '../packages/core-model/src/style.js';
import {
  ATTACK_SIGNATURES, attackSignatures, DEFENSE_SIGNATURES, defenseSignatures,
} from '../packages/core-model/src/signature.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import {
  simulateFight, simulateFightSteps, buildCommentary, buildRoundStats, totalStats, accuracy,
  proposeCornerAdvice, buildFightSummary, type FightStepUpdate, type FightEvent,
} from '../packages/engine-fight/src/index.js';
import { coachSuitability } from '../packages/ai/src/index.js';
import { toSnapshot, makeJudges } from '../packages/sim-cli/src/calibrate.js';
import {
  buildWorld, runSeason, simulateDay, startSeasonClock, type SeasonClock,
} from '../packages/sim-cli/src/season.js';
import {
  saveCareer, loadCareer, describeSave, startCareer, playerStable,
} from '../packages/session/src/index.js';
import {
  buildTierIndex, formatIso, rankingKey, nextFightIndex, parseTitleKey,
  type PlayerCommand, type ScheduledFight, type World, type WorldEvent,
} from '../packages/engine-world/src/index.js';
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

/**
 * План на бій з плану й сценарію (ADR-0028). `strategyBaseAxes` дає **зсуви**, а
 * `FightPlan.baseAxes` за ADR-0014 — вже результуючі осі бійця; тому зсув
 * накладається на власні осі й утримується в 1–20 — так само, як `planFor` у світі.
 */
function strategyPlan(axes: StyleAxes, choice: StrategyChoice): { baseAxes: Partial<StyleAxes>; blocks: [] } {
  const baseAxes: Partial<StyleAxes> = {};
  for (const [axis, delta] of Object.entries(strategyBaseAxes(choice.plan, choice.scenario)) as [StyleAxis, number][]) {
    baseAxes[axis] = Math.max(1, Math.min(20, axes[axis] + delta));
  }
  return { baseAxes, blocks: [] };
}

/** Межа поради кута (ADR-0028) — магнітуда осей, яку дозволяє сам обраний сценарій. */
function scenarioBounds(scenario: StrategyScenarioId): { maxDelta: Record<string, number> } {
  return { maxDelta: { ...STRATEGY_SCENARIO_ADVICE_BOUNDS[scenario] } as Record<string, number> };
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
  const snapA = toSnapshot(a as never);
  const snapB = toSnapshot(b as never);
  const context = {
    scheduledRounds: SCHEDULED_ROUNDS, judges: makeJudges(rng),
    planA: strategyPlan(snapA.styleAxes, strategyA),
    planB: strategyPlan(snapB.styleAxes, strategyB),
    threeKnockdownRule: false,
  };

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
  resetLive(season.world);
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
    resetLive(world);
    return { ok: true, summary: describeSave(text), season: liveSummary() };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

// ── Живий світ: один на всю сесію, крок — день, гравець вирішує сам ────────
// Аудит ядра §4.2: доти таблиця бійців показувала світ до сезону, а сезон жив окремо.
// Тепер таблиця, картка, показовий бій, кар'єра й збереження читають той самий `lastWorld`.

type DecisionCommand = Exclude<PlayerCommand, { t: 'scheduleFight' }>;

let clock: SeasonClock | null = null;
let liveFights = 0;
let liveTiers: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
let liveDecisions = 0;
/** Відповіді гравця застосовуються на початку наступного дня — так само, як авто-політика. */
let queued: DecisionCommand[] = [];
const answered = new Set<string>();
/**
 * День титульних боїв, уже оголошений гравцеві. «Далі» зупиняється **перед** таким днем
 * (анонс), а наступне «Далі» проводить саме його й показує резюме — гра не проскакує пояси.
 */
let announcedDay: number | null = null;

/**
 * Зліпки атрибутів раз на 4 тижні — для показу прогресу/регресу за останній період.
 * Посилання, не копії: світ незмінний, тож зліпок коштує лише масив посилань.
 * Поки розвиток бійця не змодельовано (атрибути в світі не змінюються), дельти нульові.
 */
interface AttributeSnapshot { day: number; attributes: Record<string, Record<string, number>> }
let snapshots: AttributeSnapshot[] = [];
const SNAPSHOT_EVERY_DAYS = 28;
const DELTA_WINDOW_DAYS = 84;

function takeSnapshot(world: World): void {
  const attributes: Record<string, Record<string, number>> = {};
  for (const f of Object.values(world.fighters)) attributes[f.id] = f.attributes as unknown as Record<string, number>;
  snapshots.push({ day: world.day, attributes });
  if (snapshots.length > 14) snapshots = snapshots.slice(-14);
}

function resetLive(world: World): void {
  lastWorld = world;
  clock = startSeasonClock(world);
  liveFights = 0;
  liveTiers = { 1: 0, 2: 0, 3: 0 };
  liveDecisions = 0;
  queued = [];
  answered.clear();
  announcedDay = null;
  snapshots = [];
  takeSnapshot(world);
}

function namesOf(world: World): Record<string, string> {
  const names: Record<string, string> = {};
  for (const f of Object.values(world.fighters)) names[f.id] = f.name;
  return names;
}

/** Рішення підопічних, на які гравець ще не відповів (ADR-0020, ADR-0023). */
function pendingDecisions(): unknown[] {
  const world = lastWorld;
  if (!world) return [];
  const names = namesOf(world);
  return world.decisions
    .filter((d) => world.playerFighterIds.includes(d.fighterId) && !answered.has(d.id))
    .map((d) => {
      const base = { id: d.id, t: d.t, fighterName: names[d.fighterId] ?? '—', deadline: formatIso(d.deadline) };
      if (d.t === 'fightOffer') {
        const opponentId = d.fight.aId === d.fighterId ? d.fight.bId : d.fight.aId;
        return {
          ...base, opponentName: names[opponentId] ?? '—', date: formatIso(d.fight.day),
          titleKey: d.fight.titleKey ?? null,
        };
      }
      if (d.t === 'campPhase') return { ...base, phase: d.phase };
      return { ...base, opponentName: names[d.opponentId] ?? '—' };
    });
}

function liveSummary(): unknown {
  if (!lastWorld) return null;
  return {
    ...(summarise(lastWorld, liveFights, liveTiers) as object),
    decisionsMade: liveDecisions,
    decisions: pendingDecisions(),
  };
}

function newWorld(seed: number, fighters: number): unknown {
  resetLive(buildWorld(seed, fighters));
  return liveSummary();
}

/**
 * Бійці живого світу з історією боїв — таблиця й картка показують **поточний** стан:
 * рекорд, форму, знос і останні бої оновлюються після кожного бою.
 */
function attributeDelta(
  now: Record<string, number>, then: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!then) return out;
  for (const [key, value] of Object.entries(now)) {
    const d = value - (then[key] ?? value);
    if (d !== 0) out[key] = d;
  }
  return out;
}

function worldFighters(): unknown[] {
  const world = lastWorld;
  if (!world) return [];
  const names = namesOf(world);
  // Зліпок-орієнтир: найстаріший у межах вікна (≈12 тижнів), щоб дельта мала сенс періоду.
  const reference = snapshots.find((x) => world.day - x.day <= DELTA_WINDOW_DAYS && x.day < world.day) ?? null;
  return Object.values(world.fighters).map((f) => ({
    ...f,
    attributeDelta: attributeDelta(f.attributes as unknown as Record<string, number>, reference?.attributes[f.id]),
    attributeDeltaWeeks: reference === null ? 0 : Math.round((world.day - reference.day) / 7),
    unavailableUntil: world.unavailableUntil[f.id] ?? null,
    history: (world.history[f.id] ?? []).slice(-6).reverse().map((h) => ({
      ...h, opponentName: names[h.opponentId] ?? '—', date: formatIso(h.day),
    })),
  }));
}

function takeUnderCare(fighterId: string): unknown {
  if (!lastWorld) return null;
  lastWorld = startCareer(lastWorld, fighterId);
  return liveSummary();
}

function answerDecision(command: DecisionCommand): unknown {
  queued.push(command);
  answered.add(command.decisionId);
  liveDecisions++;
  return liveSummary();
}

const titleFightsOn = (world: World, day: number): ScheduledFight[] =>
  world.schedule.filter((f) => f.day === day && f.titleKey !== undefined)
    .sort((x, y) => (x.id < y.id ? -1 : 1));

/** Боєць у картці титульного бою — стан **до** бою (рекорд, позиція, прийоми). */
function titleCorner(world: World, fighterId: string, titleKey: string): unknown {
  const f = world.fighters[fighterId];
  if (!f) return null;
  const row = (world.rankings[titleKey] ?? []).find((r) => r.fighterId === fighterId);
  return {
    id: f.id, name: f.name, countryCode: f.countryCode, age: f.age, record: f.record,
    stance: f.constants.stance, heightCm: f.constants.heightCm, reachCm: f.constants.reachCm,
    style: styleLabel(f.styleAxes),
    champion: world.titles[titleKey]?.championId === fighterId,
    position: row?.position ?? null,
    attack: attackSignatures(f.attributes), defense: defenseSignatures(f.attributes),
    sharpness: f.condition.sharpness, freshness: f.condition.freshness,
  };
}

function titleCard(world: World, fight: ScheduledFight): unknown {
  const titleKey = fight.titleKey as string;
  const { bodyId, weightClassId } = parseTitleKey(titleKey);
  const title = world.titles[titleKey];
  return {
    fightId: fight.id, date: formatIso(fight.day), bodyId, weightClassId,
    rounds: fight.scheduledRounds,
    vacant: !title?.championId, defences: title?.defences ?? 0,
    a: titleCorner(world, fight.aId, titleKey), b: titleCorner(world, fight.bId, titleKey),
  };
}

/**
 * Резюме титульного бою: з логу (`buildFightSummary`) і з подій дня — травми після бою,
 * пояс завойовано чи захищено. Картка бійців — зі світу **до** бою, щоб рекорд був той,
 * з яким вони виходили в ринг.
 */
function titleResult(
  before: World, events: readonly WorldEvent[], fight: ScheduledFight, log: readonly FightEvent[] | undefined,
): unknown {
  const card = titleCard(before, fight);
  const done = events.find((e) => e.t === 'FightCompleted' && e.fightId === fight.id);
  if (!done || !log) return { card, cancelled: true };
  const injuryOf = (id: string): number | null => {
    const e = events.find((x) => x.t === 'FighterInjured' && x.fighterId === id);
    return e && e.t === 'FighterInjured' ? e.daysOut : null;
  };
  const won = events.find((e) => e.t === 'TitleWon' && e.titleKey === fight.titleKey);
  const defended = events.find((e) => e.t === 'TitleDefended' && e.titleKey === fight.titleKey);
  const summary = buildFightSummary(log);
  // Підсумкові картки суддів — сума карток раундів кожного судді, як їх оголошують у рингу.
  const scorecards: [number, number][] = [];
  for (const round of buildRoundStats(log)) {
    (round.cards ?? []).forEach(([a, b], i) => {
      const acc = scorecards[i] ?? [0, 0];
      scorecards[i] = [acc[0] + a, acc[1] + b];
    });
  }
  return {
    card, cancelled: false, summary, scorecards,
    accuracy: { a: accuracy(summary.totals.a), b: accuracy(summary.totals.b) },
    injuries: { a: injuryOf(fight.aId), b: injuryOf(fight.bId) },
    outcome: won ? (won.t === 'TitleWon' && won.vacant ? 'vacantWon' : 'newChampion')
      : defended ? 'defended' : 'noChange',
  };
}

/**
 * «Далі»: до семи днів світу. Зупиняється раніше, щойно в підопічного з'являється нове
 * рішення — інакше дводенний дедлайн фази табору минав би всередині тижня без гравця.
 */
function advanceWeek(): unknown {
  if (!lastWorld || !clock) return null;
  const seen = new Set(lastWorld.decisions.map((d) => d.id));
  const names = namesOf(lastWorld);
  const playerFights: unknown[] = [];
  let daysAdvanced = 0;
  let titleAnnouncement: unknown[] = [];
  let titleResults: unknown[] = [];

  for (let d = 0; d < 7; d++) {
    // День поясів: спершу зупинка з анонсом, і лише наступне «Далі» проводить бої.
    const tomorrow = lastWorld.day + 1;
    const titleToday = titleFightsOn(lastWorld, tomorrow);
    if (titleToday.length > 0 && announcedDay !== tomorrow) {
      announcedDay = tomorrow;
      titleAnnouncement = titleToday.map((f) => titleCard(lastWorld as World, f));
      break;
    }
    const before = lastWorld;
    const commands = queued;
    queued = [];
    const { world, events, titleFightLogs } = simulateDay(lastWorld, clock, commands);
    lastWorld = world;
    daysAdvanced++;
    if (titleToday.length > 0) {
      titleResults = titleToday.map((f) => titleResult(before, events, f, titleFightLogs[f.id]));
      announcedDay = null;
    }
    for (const event of events) {
      if (event.t !== 'FightCompleted') continue;
      liveFights++;
      liveTiers[event.tier] = (liveTiers[event.tier] ?? 0) + 1;
      const mine = world.playerFighterIds.find((id) => id === event.aId || id === event.bId);
      if (mine === undefined) continue;
      const opponentId = mine === event.aId ? event.bId : event.aId;
      playerFights.push({
        fighterName: names[mine] ?? '—', opponentName: names[opponentId] ?? '—',
        date: formatIso(event.day), method: event.method, endingRound: event.endingRound,
        won: event.winnerId === null ? null : event.winnerId === mine,
      });
    }
    const fresh = world.decisions.some((x) => !seen.has(x.id) && world.playerFighterIds.includes(x.fighterId));
    // Після дня поясів — теж пауза: резюме боїв треба прочитати, а не прогорнути.
    if (fresh || titleResults.length > 0) break;
  }

  const lastSnap = snapshots.at(-1);
  if (!lastSnap || lastWorld.day - lastSnap.day >= SNAPSHOT_EVERY_DAYS) takeSnapshot(lastWorld);

  const open = new Set(lastWorld.decisions.map((d) => d.id));
  for (const id of [...answered]) if (!open.has(id)) answered.delete(id);
  return { ...(liveSummary() as object), daysAdvanced, playerFights, titleAnnouncement, titleResults };
}

window.BM = {
  generateWorld, WEIGHT_CLASSES, SANCTIONING_BODIES, CURRENCIES, STYLE_AXES, styleLabel,
  ATTACK_SIGNATURES, attackSignatures, DEFENSE_SIGNATURES, defenseSignatures,
  CAMP_PHASES, CAMP_LOADS, CAMP_FOCUSES_BY_PHASE, FIGHT_PLANS,
  STRATEGY_PLANS, STRATEGY_SCENARIOS, STRATEGY_PLAN_SUITABILITY, STRATEGY_SCENARIO_AXES,
  STRATEGY_SCENARIO_ADVICE_BOUNDS, coachAdvice,
  runFight, simulateSeason, exportCareer, importCareer, formatIso,
  newWorld, worldFighters, takeUnderCare, answerDecision, advanceWeek, liveSummary,
  buildCommentary, buildRoundStats, totalStats, accuracy, renderLine,
  createTranslator, LOCALES, LOCALE_NAMES, UNIT_SYSTEMS, THEMES,
  formatLength, formatWeight, formatMoney,
  groups: {
    technical: TECHNICAL_ATTRIBUTES, physical: PHYSICAL_ATTRIBUTES, mental: MENTAL_ATTRIBUTES,
  },
};
