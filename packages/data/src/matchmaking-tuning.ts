import raw from './reference/matchmaking.json' with { type: 'json' };

/**
 * Коефіцієнти матчмейкінгу (ADR-0024). Живуть у JSON, не в коді: `AGENTS.md` §4.
 */
export interface SeekingTuning {
  /** Скільки днів без бою і без пропозиції, перш ніж боєць почне шукати бій сам. */
  afterDays: number;
  appealBonus: number;
  bonusPerExtraMonth: number;
  maxBonus: number;
  /**
   * Наскільки поступливішим стає **суперник** забутого бійця: множник до надбавки,
   * що знижує поріг шансу на перемогу. У реальному боксі його вмовляють грошима,
   * яких у моделі ще немає, тож це їхній тимчасовий замінник.
   */
  opponentAllowancePerBonus: number;
}

const { _note, ...groups } = raw as Record<string, unknown>;
void _note;

export const MATCHMAKING_TUNING = groups as unknown as { seeking: SeekingTuning };

/**
 * Надбавка за простій. Нуль, поки боєць у нормальному ритмі; далі росте з місяцями,
 * але має стелю — інакше «забутий» боєць витіснив би з картки взагалі все.
 */
export function seekingBonus(daysIdle: number): number {
  const t = MATCHMAKING_TUNING.seeking;
  if (daysIdle < t.afterDays) return 0;
  const extraMonths = (daysIdle - t.afterDays) / 30.44;
  return Math.min(t.maxBonus, t.appealBonus + extraMonths * t.bonusPerExtraMonth);
}

/** Послаблення порогу для того, кому пропонують бій із забутим бійцем. */
export const seekingAllowance = (opponentSeeking: number): number =>
  opponentSeeking * MATCHMAKING_TUNING.seeking.opponentAllowancePerBonus;
