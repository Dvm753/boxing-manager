import type { StyleAxis } from '@bm/core-model';
import { accuracy, type SideRoundStats } from './round-stats.js';
import type { RoundBlockPlan } from './types.js';

/**
 * Порада кута на конкретні дії між раундами (ADR-0028) — прикладна частина
 * покрокового рушія (`simulateFightSteps`). Чиста, детермінована функція: без RNG,
 * без даних про «плани»/«сценарії» (це `packages/data`, рушій про них не знає).
 * Хто викликає, той і визначає межі — `bounds` приходить ззовні як магнітуда,
 * дозволена вже затвердженим сценарієм (ADR-0028: порада не може вийти за нього).
 */
export interface CornerAdviceBounds {
  /** Максимальний зсув по осі, симетрично в обидва боки; відсутня вісь — не займається. */
  maxDelta: Partial<Record<StyleAxis, number>>;
}

/**
 * Пропонує невеликий зсув осей на `fromRound…toRound` за простим читанням раунду:
 * позаду на очках чи вибитий — обережніше; помітно попереду і не вимотаний — натиск.
 * `null` — порад немає цього разу (не кожен раунд є привід щось міняти).
 */
export function proposeCornerAdvice(
  own: SideRoundStats, opponent: SideRoundStats, ownStamina: number,
  bounds: CornerAdviceBounds, fromRound: number, toRound: number,
): RoundBlockPlan | null {
  const ownAcc = accuracy(own);
  const oppAcc = accuracy(opponent);
  const behind = ownAcc < oppAcc - 8 || own.landed < opponent.landed - 3;
  const gassed = ownStamina < 40;
  const ahead = !gassed && ownAcc > oppAcc + 8 && own.landed >= opponent.landed;

  const axisAdjustments: Partial<Record<StyleAxis, number>> = {};
  const riskBound = bounds.maxDelta.risk;
  const volumeBound = bounds.maxDelta.punchVolume;

  if (gassed || behind) {
    if (riskBound) axisAdjustments.risk = -riskBound;
    if (volumeBound && gassed) axisAdjustments.punchVolume = -volumeBound;
  } else if (ahead) {
    if (riskBound) axisAdjustments.risk = riskBound;
  }

  if (Object.keys(axisAdjustments).length === 0) return null;
  return { fromRound, toRound, axisAdjustments };
}
