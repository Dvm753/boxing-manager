import { buildRoundStats, totalStats, type SideRoundStats } from './round-stats.js';
import type { FightEvent, FighterSide, FightMethod } from './types.js';

/**
 * Резюме бою — **похідна від `EventLog`**, як коментар і статистика раундів (ADR-0003,
 * ADR-0025): рушій нічого додатково не рахує. Відповідає на питання, які ставить
 * глядач після бою: хто переміг і як, хто домінував, чи був перелом, що важливого
 * сталося (нокдауни, розсічення, попередження, зняті бали).
 */
export type FightMoment =
  | { kind: 'knockdown'; round: number; by: FighterSide }
  | { kind: 'cut'; round: number; on: FighterSide }
  | { kind: 'warning'; round: number; by: FighterSide }
  | { kind: 'deduction'; round: number; by: FighterSide }
  | { kind: 'stoppage'; round: number; winner: FighterSide; reason: 'ko' | 'tko' | 'rtd' };

export interface FightSummary {
  winner: FighterSide | null;
  method: FightMethod;
  endingRound: number;
  /** Раунди за більшістю суддів; раунд, де бій зупинено, не суджено й не рахується. */
  roundsWon: { a: number; b: number; even: number };
  totals: { a: SideRoundStats; b: SideRoundStats };
  /** Сторона, що взяла щонайменше дві третини суджених раундів; `null` — рівний бій. */
  dominant: FighterSide | null;
  /** Переможець у якийсь момент відставав на два й більше раунди — і все одно виграв. */
  comeback: boolean;
  /** Ключові моменти в хронологічному порядку. */
  moments: readonly FightMoment[];
}

const STOPPAGE_METHOD: Record<'ko' | 'tko' | 'rtd', FightMethod> = { ko: 'KO', tko: 'TKO', rtd: 'RTD' };

export function buildFightSummary(eventLog: readonly FightEvent[]): FightSummary {
  const rounds = buildRoundStats(eventLog);
  const roundsWon = { a: 0, b: 0, even: 0 };
  const moments: FightMoment[] = [];
  let winner: FighterSide | null = null;
  let method: FightMethod = 'D';
  let endingRound = rounds.at(-1)?.round ?? 0;
  let worstDeficit = { a: 0, b: 0 };

  for (const round of rounds) {
    if (round.cards === null) continue;
    let forA = 0;
    let forB = 0;
    for (const [a, b] of round.cards) {
      if (a > b) forA++;
      else if (b > a) forB++;
    }
    // «Більшість суддів» — справжня більшість з усіх карток, а не з тих, що не рівні:
    // один суддя з трьох, що віддав раунд, раунд ще не виграє.
    const majority = round.cards.length / 2;
    if (forA > majority) roundsWon.a++;
    else if (forB > majority) roundsWon.b++;
    else roundsWon.even++;
    worstDeficit = {
      a: Math.max(worstDeficit.a, roundsWon.b - roundsWon.a),
      b: Math.max(worstDeficit.b, roundsWon.a - roundsWon.b),
    };
  }

  for (const event of eventLog) {
    switch (event.t) {
      case 'knockdown': moments.push({ kind: 'knockdown', round: event.round, by: event.by }); break;
      case 'cut': moments.push({ kind: 'cut', round: event.round, on: event.on }); break;
      case 'foul':
        moments.push({ kind: event.penalized ? 'deduction' : 'warning', round: event.round, by: event.by });
        break;
      case 'stoppage':
        moments.push({ kind: 'stoppage', round: event.round, winner: event.winner, reason: event.reason });
        winner = event.winner;
        method = STOPPAGE_METHOD[event.reason];
        endingRound = event.round;
        break;
      case 'decision':
        winner = event.winner;
        method = event.kind;
        break;
      default:
        break;
    }
  }

  const judged = roundsWon.a + roundsWon.b + roundsWon.even;
  const dominant: FighterSide | null =
    judged > 0 && roundsWon.a * 3 >= judged * 2 ? 'a'
      : judged > 0 && roundsWon.b * 3 >= judged * 2 ? 'b'
        : null;

  return {
    winner, method, endingRound, roundsWon,
    totals: totalStats(rounds),
    dominant,
    comeback: winner !== null && worstDeficit[winner] >= 2,
    moments,
  };
}
