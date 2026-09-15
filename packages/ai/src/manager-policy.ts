import { normalize, type Fighter } from '@bm/core-model';
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
): MatchCandidate {
  const values = Object.values(fighter.attributes);
  let sum = 0;
  for (const v of values) sum += v;
  const positions = rankings.map((r) => r.position).filter((p): p is number => p !== null);
  return {
    fighter, rankings, lastFightDay, available,
    ability: sum / values.length,
    bestPosition: positions.length === 0 ? 30 : Math.min(...positions),
  };
}

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

  const daysIdle = self.lastFightDay === null ? 240 : day - self.lastFightDay;
  const inactivityPressure = Math.min(1.5, daysIdle / 180);

  // Стиль і вік дають невеликий зсув: незручний суперник менш привабливий.
  const styleFriction = Math.abs(
    normalize(self.fighter.styleAxes.counterTendency) - normalize(opponent.fighter.styleAxes.pressure),
  ) * 0.15;

  const score =
    reward * weights.reward
    - risk * weights.risk * (1 - winChance)
    + inactivityPressure * 0.9
    - styleFriction;

  const accept = self.available && opponent.available
    && winChance >= weights.minWinChance - inactivityPressure * 0.12
    && score > 0;

  return { winChance, reward, risk, inactivityPressure, score, accept };
}
