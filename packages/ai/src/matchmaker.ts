import { assessOffer } from './manager-policy.js';
import type { MatchCandidate, MatchmakingContext, ProposedBout } from './types.js';

/**
 * Матчмейкінг: складання картки з пропозицій, на які згодні **обидві** сторони.
 *
 * Бій виникає лише тоді, коли його хочуть двоє. Саме тому чемпіон уникає небезпечного
 * претендента, а перспективного бережуть — це не окреме правило, а наслідок симетрії оцінки.
 */
export interface MatchmakingOptions {
  /** Скільки боїв намагатися зібрати. */
  targetBouts: number;
  /** Скільки суперників перебирати кожному бійцю. */
  candidatesPerFighter: number;
}

const DEFAULTS: MatchmakingOptions = { targetBouts: 8, candidatesPerFighter: 12 };

export function proposeCard(
  candidates: readonly MatchCandidate[],
  context: MatchmakingContext,
  options: Partial<MatchmakingOptions> = {},
): readonly ProposedBout[] {
  const { targetBouts, candidatesPerFighter } = { ...DEFAULTS, ...options };

  // Групуємо за ваговою категорією: бій поза категорією — окреме рішення, якого ще немає.
  const byClass = new Map<string, MatchCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.available) continue;
    const key = candidate.fighter.constants.naturalWeightClassId;
    const list = byClass.get(key);
    if (list) list.push(candidate); else byClass.set(key, [candidate]);
  }

  const offers: ProposedBout[] = [];
  for (const [, pool] of [...byClass.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (pool.length < 2) continue;
    for (const self of pool) {
      for (let i = 0; i < candidatesPerFighter; i++) {
        const other = pool[context.rng.int(0, pool.length - 1)] as MatchCandidate;
        if (other.fighter.id === self.fighter.id) continue;
        // Симетрія: домовленість потрібна від обох.
        const mine = assessOffer(self, other, context.day);
        if (!mine.accept) continue;
        const theirs = assessOffer(other, self, context.day);
        if (!theirs.accept) continue;
        const [aId, bId] = self.fighter.id < other.fighter.id
          ? [self.fighter.id, other.fighter.id]
          : [other.fighter.id, self.fighter.id];
        offers.push({ aId, bId, appeal: (mine.score + theirs.score) / 2 });
      }
    }
  }

  // Найпривабливіші бої першими; кожен боєць потрапляє на картку лише раз.
  offers.sort((x, y) => y.appeal - x.appeal || (x.aId < y.aId ? -1 : 1));
  const taken = new Set<string>();
  const card: ProposedBout[] = [];
  for (const bout of offers) {
    if (card.length >= targetBouts) break;
    if (taken.has(bout.aId) || taken.has(bout.bId)) continue;
    taken.add(bout.aId);
    taken.add(bout.bId);
    card.push(bout);
  }
  return card;
}
