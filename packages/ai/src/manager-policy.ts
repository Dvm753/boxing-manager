import { normalize, type Fighter } from '@bm/core-model';
import { seekingAllowance, seekingBonus } from '@bm/data';
import type { MatchCandidate, OfferAssessment } from './types.js';

/**
 * Політика менеджера: оцінка однієї пропозиції бою.
 *
 * Чиста функція без стану і без I/O (`AGENTS.md` §3). Гравець і ШІ користуються
 * **тим самим** розрахунком — це вимога `WORLD_ENGINE_SPEC.md`.
 */

/** Стадія кар'єри визначає, чим менеджер готовий ризикувати. */
export type CareerStage = 'prospect' | 'contender' | 'champion' | 'veteran' | 'journeyman';

export function careerStage(candidate: MatchCandidate): CareerStage {
  const { fighter } = candidate;
  const fights = fighter.record.wins + fighter.record.losses + fighter.record.draws;
  const best = candidate.bestPosition;

  if (best <= 3) return 'champion';
  if (best <= 15) return 'contender';
  if (fighter.age >= 33 || fighter.wear.headTrauma >= 55) return 'veteran';
  if (fights >= 12 && fighter.record.losses >= fighter.record.wins * 0.6) return 'journeyman';
  return 'prospect';
}

/** Готує похідні величини один раз — далі оцінка їх лише читає. */
export function makeCandidate(
  fighter: Fighter,
  rankings: MatchCandidate['rankings'],
  lastFightDay: number | null,
  available: boolean,
  /** Скільки днів боєць існує у світі (ADR-0024). Нуль — світ щойно створено. */
  daysSinceStart = 0,
): MatchCandidate {
  const values = Object.values(fighter.attributes);
  let sum = 0;
  for (const v of values) sum += v;
  const positions = rankings.map((r) => r.position).filter((p): p is number => p !== null);
  return {
    fighter, rankings, lastFightDay, available, daysSinceStart,
    ability: sum / values.length,
    bestPosition: positions.length === 0 ? 30 : Math.min(...positions),
  };
}

/**
 * Скільки днів «простою» приписується бійцю, який ще не бився в симуляції.
 * Це не магічне число, а припущення про минуле: у згенерованого бійця вже є рекорд.
 */
const ASSUMED_IDLE_AT_START = 240;

/**
 * «Про мене забули» — інший годинник, ніж «я голодний до бою» (ADR-0024).
 * Рахується **від початку симуляції**: на старті світу ніхто ще не забутий, бо світ
 * не мав можливості дати бій. Інакше надбавку отримали б усі одразу.
 */
export const daysUnseen = (candidate: MatchCandidate, day: number): number =>
  candidate.lastFightDay === null ? candidate.daysSinceStart : day - candidate.lastFightDay;

/**
 * Ваги за стадією кар'єри. Перспективного бережуть, претендент мусить ризикувати,
 * ветеран бере гроші й шанс, джорнимен б'ється з ким завгодно.
 */
const STAGE_WEIGHTS: Record<CareerStage, { reward: number; risk: number; minWinChance: number }> = {
  prospect:   { reward: 0.8, risk: 1.9, minWinChance: 0.62 },
  contender:  { reward: 1.5, risk: 1.0, minWinChance: 0.40 },
  champion:   { reward: 1.2, risk: 1.3, minWinChance: 0.45 },
  veteran:    { reward: 1.4, risk: 0.7, minWinChance: 0.32 },
  // Джорнимен **не має порогу за шансом на перемогу**, і це не спрощення.
  // Виміряні дані Q1 (`docs/research/Q1_PACKAGE_AUDIT.md`): безпереможні бійці програють
  // достроково у 63–80% випадків, тобто їх регулярно ставлять під перспективних.
  // Джорнимена відбирає не власна оцінка шансів, а чужа готовність його виставити.
  journeyman: { reward: 0.9, risk: 0.3, minWinChance: 0 },
};

export function assessOffer(
  self: MatchCandidate, opponent: MatchCandidate, day: number,
): OfferAssessment {
  const stage = careerStage(self);
  const weights = STAGE_WEIGHTS[stage];

  // Логістика від різниці в майстерності — той самий підхід, що в наближенні рівнів (ADR-0015).
  const gap = self.ability - opponent.ability;
  const winChance = 1 / (1 + Math.exp(-gap * 1.2));

  const selfPos = self.bestPosition;
  const opponentPos = opponent.bestPosition;
  // Нагорода: перемога над вищим за рейтингом коштує більше.
  const reward = Math.max(0, selfPos - opponentPos) / 10 + (opponentPos <= 15 ? 0.6 : 0.1);
  // Ризик: програти нижчому за рейтингом дорожче.
  const risk = Math.max(0, opponentPos - selfPos) / 12 + (selfPos <= 15 ? 0.7 : 0.2);

  // Згенерований боєць уже має рекорд, тобто бився до початку світу: без цього припущення
  // на першому тижні ніхто б не був голодним до бою і світ стартував би майже порожнім.
  const daysIdle = self.lastFightDay === null ? ASSUMED_IDLE_AT_START : day - self.lastFightDay;
  const inactivityPressure = Math.min(1.5, daysIdle / 180);

  /**
   * «Про мене забули» — інший годинник, ніж «я голодний до бою» (ADR-0024).
   * Він рахується **від початку симуляції**: на старті світу ніхто ще не забутий,
   * бо світ не мав можливості дати бій. Інакше надбавку отримали б усі одразу,
   * і вона перестала б щось означати.
   */
  const seeking = seekingBonus(daysUnseen(self, day));

  /**
   * Другий бік тієї самої монети: якщо забутий **суперник**, менеджер стає поступливішим.
   * Без цього правило не працює для сильного бійця, якого ніхто не хоче: сам він згоден
   * на будь-кого, але згоди другої сторони немає — і бою немає.
   */
  const allowance = seekingAllowance(seekingBonus(daysUnseen(opponent, day)));

  // Стиль і вік дають невеликий зсув: незручний суперник менш привабливий.
  const styleFriction = Math.abs(
    normalize(self.fighter.styleAxes.counterTendency) - normalize(opponent.fighter.styleAxes.pressure),
  ) * 0.15;

  const score =
    reward * weights.reward
    - risk * weights.risk * (1 - winChance)
    + inactivityPressure * 0.9
    + seeking
    - styleFriction;

  const accept = self.available && opponent.available
    && winChance >= weights.minWinChance - inactivityPressure * 0.12 - allowance
    && score > 0;

  return { winChance, reward, risk, inactivityPressure, seeking, score, accept };
}
