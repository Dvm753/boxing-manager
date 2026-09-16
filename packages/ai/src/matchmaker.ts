import { seekingBonus } from '@bm/data';
import { assessOffer, daysUnseen } from './manager-policy.js';
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
  /** Чи приводити суперника тому, кого ніхто не кличе (ADR-0024). */
  forced: boolean;
}

const DEFAULTS: MatchmakingOptions = { targetBouts: 8, candidatesPerFighter: 12, forced: true };

export function proposeCard(
  candidates: readonly MatchCandidate[],
  context: MatchmakingContext,
  options: Partial<MatchmakingOptions> = {},
): readonly ProposedBout[] {
  const { targetBouts, candidatesPerFighter, forced } = { ...DEFAULTS, ...options };

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
        // Надбавка за простій уже всередині обох оцінок (ADR-0024), тому бій, у якому
        // хоч один бік давно без роботи, сам піднімається в черзі картки.
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

  return forced ? [...card, ...forcedBouts(byClass, context, taken)] : card;
}

/**
 * Бій для того, кого ніхто не кличе (ADR-0024).
 *
 * Надбавки до згоди недостатньо: сильного, але нерейтингового бійця уникають **обидві**
 * сторони — йому нічого не дає перемога над ніким, а суперник не хоче програти фавориту.
 * У реальному боксі це розв'язують грошима; грошей у моделі ще немає (фаза 2), тому діє
 * пряме правило: після порога простою промоутер **приводить** суперника, а не чекає згоди.
 *
 * Це остання ланка, а не перша: спершу звичайна картка, і лише ті, хто в неї не потрапив.
 */
function forcedBouts(
  byClass: Map<string, MatchCandidate[]>,
  context: MatchmakingContext,
  taken: Set<string>,
): ProposedBout[] {
  const out: ProposedBout[] = [];

  for (const [, pool] of [...byClass.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (pool.length < 2) continue;
    const seeking = pool
      .filter((c) => !taken.has(c.fighter.id) && seekingBonus(daysUnseen(c, context.day)) > 0)
      .sort((x, y) => daysUnseen(y, context.day) - daysUnseen(x, context.day)
        || (x.fighter.id < y.fighter.id ? -1 : 1));

    for (const self of seeking) {
      if (taken.has(self.fighter.id)) continue;
      // Суперник — той, кому цей бій найменш неприємний: промоутер шукає, кого вмовити.
      let best: { other: MatchCandidate; score: number } | null = null;
      for (const other of pool) {
        if (other.fighter.id === self.fighter.id || taken.has(other.fighter.id)) continue;
        const score = assessOffer(other, self, context.day).score;
        if (best === null || score > best.score) best = { other, score };
      }
      if (best === null) continue;

      const [aId, bId] = self.fighter.id < best.other.fighter.id
        ? [self.fighter.id, best.other.fighter.id]
        : [best.other.fighter.id, self.fighter.id];
      taken.add(aId);
      taken.add(bId);
      out.push({ aId, bId, appeal: best.score });
    }
  }

  return out;
}
