import type { Fighter } from '@bm/core-model';
import type { SimTier, World } from './types.js';

/** Скільки бійців у кожній ваговій категорії тримати на повній симуляції. */
export const TIER1_TOP_PER_CLASS = 12;
export const TIER2_TOP_PER_CLASS = 60;

export const averageAbility = (f: Fighter): number => {
  const values = Object.values(f.attributes);
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
};

/**
 * Рівень — **похідна від стану** (ADR-0015), а не збережене поле: він перераховується
 * на кожен тік, тому боєць переходить між рівнями без спеціальної логіки.
 */
export function buildTierIndex(world: World): Map<string, SimTier> {
  // Майстерність рахується один раз на бійця. Обчислювати її в компараторі означало б
  // читати 47 атрибутів на кожне з O(n log n) порівнянь — саме це й робило тік дня повільним.
  const byClass = new Map<string, { id: string; ability: number }[]>();
  for (const fighter of Object.values(world.fighters)) {
    const key = fighter.constants.naturalWeightClassId;
    const entry = { id: fighter.id, ability: averageAbility(fighter) };
    const list = byClass.get(key);
    if (list) list.push(entry); else byClass.set(key, [entry]);
  }

  const index = new Map<string, SimTier>();
  for (const list of byClass.values()) {
    list.sort((a, b) => b.ability - a.ability || (a.id < b.id ? -1 : 1));
    list.forEach((entry, position) => {
      index.set(entry.id, position < TIER1_TOP_PER_CLASS ? 1 : position < TIER2_TOP_PER_CLASS ? 2 : 3);
    });
  }

  // Бійці гравця і їхні заплановані суперники — завжди повна симуляція.
  for (const id of world.playerFighterIds) index.set(id, 1);
  for (const fight of world.schedule) {
    if (world.playerFighterIds.includes(fight.aId)) index.set(fight.bId, 1);
    if (world.playerFighterIds.includes(fight.bId)) index.set(fight.aId, 1);
  }
  return index;
}

/** Бій симулюється на найдетальнішому з рівнів двох учасників. */
export function fightTier(index: Map<string, SimTier>, aId: string, bId: string): SimTier {
  return Math.min(index.get(aId) ?? 3, index.get(bId) ?? 3) as SimTier;
}
