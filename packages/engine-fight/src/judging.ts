import type { Rng } from '@bm/core-model';
import type { FighterSide, JudgeProfile } from './types.js';
import { TUNING } from './tuning.js';

export interface RoundPerception {
  cleanA: number; cleanB: number;
  aggressionA: number; aggressionB: number;
  controlA: number; controlB: number;
  defenceA: number; defenceB: number;
  knockdownsA: number; knockdownsB: number;
}

/**
 * Система 10 очок. Кожен суддя має власний вектор ваг, тому той самий раунд
 * різні судді бачать по-різному — звідси роздільні рішення (M4 у ADR-0008).
 */
export function scoreRound(
  judge: JudgeProfile, p: RoundPerception, rng: Rng, lean = 0,
): readonly [number, number] {
  const total = judge.cleanPunching + judge.aggression + judge.ringGeneralship + judge.defence;
  const w = {
    clean: judge.cleanPunching / total,
    agg: judge.aggression / total,
    ctrl: judge.ringGeneralship / total,
    def: judge.defence / total,
  };

  // Кожен критерій зводиться до частки переваги в [-1, 1]. Без цього доданок з більшою
  // натуральною величиною (агресія — десятки ударів) перекрив би решту (шкода — одиниці).
  const share = (a: number, b: number): number => (a + b === 0 ? 0 : (a - b) / (a + b));

  const margin =
    w.clean * share(p.cleanA, p.cleanB) +
    w.agg * share(p.aggressionA, p.aggressionB) +
    w.ctrl * share(p.controlA, p.controlB) +
    w.def * share(p.defenceA, p.defenceB) +
    (rng.next() - 0.5) * 2 * TUNING.judgeNoise +
    judge.bias * 0.1 +
    // Якоріння: суддя, який уже бачить лідера, схильний віддавати йому й близькі раунди.
    // Без цього раунди незалежні, і в рівному бою картка 6–6 випадає надто часто.
    Math.max(-1, Math.min(1, lean)) * TUNING.judgeAnchoring;

  let a = 10;
  let b = 10;
  if (margin > 0) b = 9; else if (margin < 0) a = 9; else { /* рівний раунд лишається 10–10 */ }

  // Нокдаун майже завжди коштує додаткове очко.
  a -= p.knockdownsB;
  b -= p.knockdownsA;
  if (p.knockdownsA > 0 && margin < 0) a = 10;
  if (p.knockdownsB > 0 && margin > 0) b = 10;

  return [Math.max(6, a), Math.max(6, b)] as const;
}

export type DecisionKind = 'UD' | 'SD' | 'MD' | 'D';

export function resolveDecision(
  cards: readonly (readonly [number, number])[],
): { kind: DecisionKind; winner: FighterSide | null } {
  let forA = 0;
  let forB = 0;
  let level = 0;
  for (const [a, b] of cards) {
    if (a > b) forA++; else if (b > a) forB++; else level++;
  }
  if (forA === 3 || forB === 3) return { kind: 'UD', winner: forA === 3 ? 'a' : 'b' };
  if (forA === 2 && forB === 1) return { kind: 'SD', winner: 'a' };
  if (forB === 2 && forA === 1) return { kind: 'SD', winner: 'b' };
  if (forA === 2 && level === 1) return { kind: 'MD', winner: 'a' };
  if (forB === 2 && level === 1) return { kind: 'MD', winner: 'b' };
  return { kind: 'D', winner: null };
}
