import { LANDED_QUALITIES, type FightEvent, type FighterSide } from './types.js';

/**
 * Статистика за раундами — **похідна від `EventLog`**, як і коментар (ADR-0003).
 * Рушій нічого додатково не рахує і нічого не зберігає: та сама властивість, що дозволяє
 * показати той самий бій трьома різними способами (ADR-0025).
 *
 * Фолів тут усе ще немає (Q29) — це нова механіка, окреме рішення класу A.
 */
export interface SideRoundStats {
  thrown: number;
  landed: number;
  /** Влучання `clean`, `heavy` і `critical` — те, що в трансляціях називають сильними. */
  power: number;
  knockdowns: number;
  cuts: number;
  stuns: number;
}

export interface RoundStats {
  round: number;
  a: SideRoundStats;
  b: SideRoundStats;
  /** Картка кожного судді за цей раунд, у порядку `context.judges`; `null` — раунд ще не суджено. */
  cards: readonly (readonly [number, number])[] | null;
  /** Втома 0–100 наприкінці раунду, до відновлення в кутку; `null` — ще невідомо. */
  staminaA: number | null;
  staminaB: number | null;
  /** Накопичена шкода наприкінці раунду, до відновлення в кутку; `null` — ще невідомо. */
  headDamageA: number | null;
  headDamageB: number | null;
  bodyDamageA: number | null;
  bodyDamageB: number | null;
  /** Чи бій завершився саме в цьому раунді. */
  finished: boolean;
}

const emptySide = (): SideRoundStats =>
  ({ thrown: 0, landed: 0, power: 0, knockdowns: 0, cuts: 0, stuns: 0 });

const POWER = new Set(['clean', 'heavy', 'critical']);

const sideOf = (stats: RoundStats, side: FighterSide): SideRoundStats =>
  side === 'a' ? stats.a : stats.b;

export function buildRoundStats(eventLog: readonly FightEvent[]): readonly RoundStats[] {
  const rounds = new Map<number, RoundStats>();

  const at = (round: number): RoundStats => {
    const existing = rounds.get(round);
    if (existing) return existing;
    const created: RoundStats = {
      round, a: emptySide(), b: emptySide(), cards: null,
      staminaA: null, staminaB: null, headDamageA: null, headDamageB: null,
      bodyDamageA: null, bodyDamageB: null, finished: false,
    };
    rounds.set(round, created);
    return created;
  };

  for (const event of eventLog) {
    switch (event.t) {
      case 'roundStart':
        at(event.round);
        break;

      case 'punch': {
        const side = sideOf(at(event.round), event.by);
        side.thrown += 1;
        if (LANDED_QUALITIES.includes(event.quality)) side.landed += 1;
        if (POWER.has(event.quality)) side.power += 1;
        break;
      }

      case 'knockdown':
        sideOf(at(event.round), event.by).knockdowns += 1;
        break;

      // Розсічення і приголомшення записуються тому, **хто їх отримав**: у трансляції
      // це «його розсікли», а не «він розсік».
      case 'cut':
        sideOf(at(event.round), event.on).cuts += 1;
        break;

      case 'stun':
        sideOf(at(event.round), event.on).stuns += 1;
        break;

      case 'roundEnd': {
        const stats = at(event.round);
        stats.cards = event.cards;
        stats.staminaA = event.staminaA;
        stats.staminaB = event.staminaB;
        stats.headDamageA = event.headDamageA;
        stats.headDamageB = event.headDamageB;
        stats.bodyDamageA = event.bodyDamageA;
        stats.bodyDamageB = event.bodyDamageB;
        break;
      }

      case 'stoppage':
        at(event.round).finished = true;
        break;

      default:
        break;
    }
  }

  const out = [...rounds.values()].sort((x, y) => x.round - y.round);
  const last = out.at(-1);
  if (last && !out.some((r) => r.finished)) last.finished = true;
  return out;
}

/** Підсумок за весь бій — сума раундів, а не окремий розрахунок. */
export function totalStats(rounds: readonly RoundStats[]): { a: SideRoundStats; b: SideRoundStats } {
  const total = { a: emptySide(), b: emptySide() };
  for (const round of rounds) {
    for (const key of ['a', 'b'] as const) {
      const from = round[key];
      const to = total[key];
      to.thrown += from.thrown;
      to.landed += from.landed;
      to.power += from.power;
      to.knockdowns += from.knockdowns;
      to.cuts += from.cuts;
      to.stuns += from.stuns;
    }
  }
  return total;
}

/** Точність у відсотках; 0, якщо не кинуто жодного удару — не `NaN` в інтерфейсі. */
export const accuracy = (side: SideRoundStats): number =>
  side.thrown === 0 ? 0 : (side.landed / side.thrown) * 100;
