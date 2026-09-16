import { createRng, deriveSeed } from '@bm/core-model';
import {
  CAMP_PHASES, CAMP_TUNING, campPhaseFor, isCampFocusOfPhase,
  type CampFocus, type CampPhase,
} from '@bm/data';
import { campEffect, nextFightIndex } from './condition.js';
import type { Camp, Decision, PlayerCommand, ScheduledFight, World, WorldEvent } from './types.js';

/**
 * Черга рішень гравця (ADR-0020) і табір підопічного (ADR-0023).
 *
 * Два правила, які тут виконуються буквально:
 * - **бій за участю бійця гравця не потрапляє в календар без згоди гравця**;
 * - пропущений дедлайн нічого не ламає: пропозиція вважається відхиленою, а фаза табору
 *   йде за замовчуванням тренера. Гра не карає за невідкритий екран.
 */

export const offerDecisionId = (fightId: string): string => `offer/${fightId}`;
export const campDecisionId = (fightId: string, phase: CampPhase): string => `camp/${fightId}/${phase}`;
export const planDecisionId = (fightId: string): string => `plan/${fightId}`;

/** За скільки днів до бою гравця питають про план: разом із підводкою. */
export const PLAN_DECISION_DAYS = CAMP_TUNING.phases.taper.from;

export class UnknownDecisionError extends Error {
  constructor(id: string) {
    super(`Рішення ${id} не знайдено — можливо, дедлайн уже минув`);
    this.name = 'UnknownDecisionError';
  }
}

export class WrongPhaseFocusError extends Error {
  constructor(focus: CampFocus, phase: CampPhase) {
    super(`Фокус «${focus}» не належить фазі «${phase}»`);
    this.name = 'WrongPhaseFocusError';
  }
}

const isPlayers = (world: World, fight: ScheduledFight): boolean =>
  world.playerFighterIds.includes(fight.aId) || world.playerFighterIds.includes(fight.bId);

const playerSide = (world: World, fight: ScheduledFight): string =>
  world.playerFighterIds.includes(fight.aId) ? fight.aId : fight.bId;

export interface CommandResult {
  world: World;
  events: WorldEvent[];
}

/**
 * Застосування команд **до** тіку: вони описують намір на майбутнє (ADR-0016).
 * Помилка в команді кидається, а не ковтається: мовчазно проігнороване рішення гравця —
 * найгірший з можливих варіантів.
 */
export function applyCommands(
  world: World, commands: readonly PlayerCommand[], day: number,
): CommandResult {
  let current = world;
  const events: WorldEvent[] = [];

  for (const command of commands) {
    switch (command.t) {
      case 'scheduleFight': {
        if (!isPlayers(current, command.fight)) {
          current = { ...current, schedule: [...current.schedule, command.fight] };
          break;
        }
        const fighterId = playerSide(current, command.fight);
        const deadline = Math.min(
          day + CAMP_TUNING.decision.offerDeadlineDays,
          command.fight.day - 1,
        );
        const decision: Decision = {
          t: 'fightOffer', id: offerDecisionId(command.fight.id),
          fighterId, deadline, fight: command.fight,
        };
        current = { ...current, decisions: [...current.decisions, decision] };
        events.push({
          t: 'FightOffered', fighterId, fightId: command.fight.id,
          day: command.fight.day, deadline,
        });
        break;
      }

      case 'acceptOffer':
      case 'declineOffer': {
        const decision = current.decisions.find((d) => d.id === command.decisionId);
        if (!decision || decision.t !== 'fightOffer') throw new UnknownDecisionError(command.decisionId);
        const rest = current.decisions.filter((d) => d.id !== command.decisionId);

        if (command.t === 'declineOffer') {
          current = { ...current, decisions: rest };
          events.push({
            t: 'OfferDeclined', fighterId: decision.fighterId,
            fightId: decision.fight.id, expired: false,
          });
          break;
        }

        const camp: Camp = {
          fighterId: decision.fighterId,
          fightId: decision.fight.id,
          fightDay: decision.fight.day,
          phases: {},
        };
        current = {
          ...current,
          decisions: rest,
          schedule: [...current.schedule, decision.fight],
          camps: [...current.camps, camp],
        };
        events.push({
          t: 'OfferAccepted', fighterId: decision.fighterId, fightId: decision.fight.id,
        });
        break;
      }

      case 'setFightPlan': {
        const decision = current.decisions.find((d) => d.id === command.decisionId);
        if (!decision || decision.t !== 'fightPlan') throw new UnknownDecisionError(command.decisionId);
        current = {
          ...current,
          decisions: current.decisions.filter((d) => d.id !== command.decisionId),
          camps: current.camps.map((camp) => camp.fightId === decision.fightId
            && camp.fighterId === decision.fighterId
            ? { ...camp, plan: command.plan }
            : camp),
        };
        events.push({
          t: 'FightPlanSet', fighterId: decision.fighterId, fightId: decision.fightId,
          plan: command.plan, byCoach: false,
        });
        break;
      }

      case 'setCampPhase': {
        const decision = current.decisions.find((d) => d.id === command.decisionId);
        if (!decision || decision.t !== 'campPhase') throw new UnknownDecisionError(command.decisionId);
        if (!isCampFocusOfPhase(decision.phase, command.focus)) {
          throw new WrongPhaseFocusError(command.focus, decision.phase);
        }
        current = {
          ...current,
          decisions: current.decisions.filter((d) => d.id !== command.decisionId),
          camps: current.camps.map((camp) => camp.fightId === decision.fightId
            && camp.fighterId === decision.fighterId
            ? { ...camp, phases: { ...camp.phases, [decision.phase]: { focus: command.focus, load: command.load } } }
            : camp),
        };
        events.push({
          t: 'CampPhaseSet', fighterId: decision.fighterId, fightId: decision.fightId,
          phase: decision.phase, focus: command.focus, load: command.load, byCoach: false,
        });
        break;
      }
    }
  }

  return { world: current, events };
}

export interface DailyDecisions {
  world: World;
  events: WorldEvent[];
}

/**
 * Обслуговування черги на новий день: прострочені рішення закриваються, нові фази
 * табору відкриваються, табори завершених боїв прибираються.
 */
export function advanceDecisions(world: World, day: number): DailyDecisions {
  const events: WorldEvent[] = [];
  let decisions = [...world.decisions];

  // 1. Прострочені. Порядок фіксований сортуванням за id: він не має залежати від
  //    порядку надходження, інакше стрічка подій розходилася б після відкриття сейву.
  const expired = decisions.filter((d) => d.deadline < day).sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const decision of expired) {
    if (decision.t === 'fightOffer') {
      events.push({
        t: 'OfferDeclined', fighterId: decision.fighterId,
        fightId: decision.fight.id, expired: true,
      });
    } else if (decision.t === 'campPhase') {
      const fallback = CAMP_TUNING.defaults[decision.phase];
      events.push({
        t: 'CampPhaseSet', fighterId: decision.fighterId, fightId: decision.fightId,
        phase: decision.phase, focus: fallback.focus, load: fallback.load, byCoach: true,
      });
    } else {
      events.push({
        t: 'FightPlanSet', fighterId: decision.fighterId, fightId: decision.fightId,
        plan: 'balanced', byCoach: true,
      });
    }
  }
  const expiredIds = new Set(expired.map((d) => d.id));
  decisions = decisions.filter((d) => !expiredIds.has(d.id));

  // 2. Табори, чий бій уже відбувся, більше не потрібні.
  const camps = world.camps.filter((camp) => camp.fightDay >= day);

  // 3. Нові фази. Рішення з'являється рівно в перший день фази.
  const opened: Decision[] = [];
  const asked = new Set(world.decisions.map((d) => d.id));
  for (const camp of camps) {
    const daysToFight = camp.fightDay - day;

    // Питання ставиться в перший день фази — або в перший день, коли табір узагалі
    // існує, якщо згода надійшла посеред фази. Інакше перша фаза мовчки зникала б:
    // бій домовляють рівно за вікно табору, і день `from` уже минув.
    const phase = campPhaseFor(daysToFight);
    if (phase !== null) {
      const id = campDecisionId(camp.fightId, phase);
      if (!asked.has(id) && camp.phases[phase] === undefined) {
        opened.push({
          t: 'campPhase', id, fighterId: camp.fighterId, fightId: camp.fightId, phase,
          deadline: day + CAMP_TUNING.decision.phaseDeadlineDays,
        });
        asked.add(id);
      }
    }

    // План на бій питається разом із підводкою — це останнє рішення перед боєм.
    if (daysToFight <= PLAN_DECISION_DAYS && daysToFight >= 0 && camp.plan === undefined) {
      const id = planDecisionId(camp.fightId);
      if (!asked.has(id)) {
        const fight = world.schedule.find((f) => f.id === camp.fightId);
        if (fight) {
          opened.push({
            t: 'fightPlan', id, fighterId: camp.fighterId, fightId: camp.fightId,
            opponentId: fight.aId === camp.fighterId ? fight.bId : fight.aId,
            deadline: day + CAMP_TUNING.decision.phaseDeadlineDays,
          });
          asked.add(id);
        }
      }
    }
  }
  opened.sort((x, y) => (x.id < y.id ? -1 : 1));

  return { world: { ...world, camps, decisions: [...decisions, ...opened] }, events };
}

/**
 * Травми в таборі (ADR-0023). Ризик несе **кожен, хто в таборі**, а не лише підопічний:
 * механіка, яка б'є тільки гравця, — не механіка, а штраф за те, що в нього є гравець.
 * Бійці ШІ тренуються за замовчуванням тренера, тому й ризик у них базовий.
 *
 * Потік випадковості власний на бійця і день: інакше поява ще одного бою в календарі
 * зсувала б усі інші кидки у світі (ADR-0003).
 */
export function campInjuries(
  world: World, day: number, index = nextFightIndex(world),
): WorldEvent[] {
  const tuning = CAMP_TUNING.injury;
  const campOf = new Map(world.camps.map((c) => [c.fighterId, c]));
  const events: WorldEvent[] = [];

  for (const [fighterId, next] of [...index].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const daysToFight = next.day - day;
    if (campPhaseFor(daysToFight) === null) continue;
    const fighter = world.fighters[fighterId];
    if (!fighter) continue;
    if ((world.unavailableUntil[fighterId] ?? 0) > day) continue;

    const proneness = fighter.attributes.injuryProneness;
    const chance = tuning.baseChancePerDay
      * (1 + proneness * tuning.perInjuryProneness)
      * campEffect(campOf.get(fighterId), daysToFight).injury;

    const rng = createRng(deriveSeed(world.seed, `camp/${fighterId}/${day}`));
    if (rng.next() >= chance) continue;

    events.push({
      t: 'CampInjury',
      fighterId,
      daysOut: Math.round(tuning.daysOutBase + proneness * tuning.daysOutPerProneness),
    });
  }

  return events;
}
