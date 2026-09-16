import {
  CAMP_TUNING, type CampFocus, type CampLoad, type CampPhase, type FightPlanId,
} from '@bm/data';
import type { PlayerCommand, World } from '@bm/engine-world';

/**
 * Політика гравця — **заготовка рішень**, а не ШІ. Вона потрібна там, де гри ще немає:
 * у прогоні сезону і в демонстраційній збірці, де ніхто не натискає кнопки щодня.
 *
 * Це не частина рушія: політика лише перетворює чергу рішень на команди, які гравець
 * ухвалив би сам. Жодного рішення вона не вигадує — набір варіантів задає ADR-0023.
 */
export interface CampPreference {
  base: { focus: CampFocus; load: CampLoad };
  work: { focus: CampFocus; load: CampLoad };
  taper: { focus: CampFocus; load: CampLoad };
}

/** Замовчування тренера: те саме, що робив би світ без гравця. */
export const COACH_PREFERENCE: CampPreference = {
  base: CAMP_TUNING.defaults.base,
  work: CAMP_TUNING.defaults.work,
  taper: CAMP_TUNING.defaults.taper,
};

export interface PlayerPolicy {
  /** Які пропозиції приймати. `none` — не приймати жодної (боєць відпочиває). */
  offers?: 'all' | 'none';
  camp?: Partial<CampPreference>;
  /** План на бій. За замовчуванням — `balanced`, тобто «бийся за своїми осями». */
  plan?: FightPlanId;
}

/**
 * Команди на сьогодні за чергою рішень. Дедлайни політика не перевіряє: прострочене
 * рішення світ уже прибрав із черги сам.
 */
export function decide(world: World, policy: PlayerPolicy = {}): PlayerCommand[] {
  const accept = (policy.offers ?? 'all') === 'all';
  const commands: PlayerCommand[] = [];

  for (const decision of world.decisions) {
    if (decision.t === 'fightOffer') {
      commands.push({ t: accept ? 'acceptOffer' : 'declineOffer', decisionId: decision.id });
      continue;
    }
    if (decision.t === 'fightPlan') {
      commands.push({ t: 'setFightPlan', decisionId: decision.id, plan: policy.plan ?? 'balanced' });
      continue;
    }
    const phase: CampPhase = decision.phase;
    const chosen = policy.camp?.[phase] ?? COACH_PREFERENCE[phase];
    commands.push({ t: 'setCampPhase', decisionId: decision.id, focus: chosen.focus, load: chosen.load });
  }

  return commands;
}
