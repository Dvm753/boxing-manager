import type { Attributes } from './attributes.js';

export type Stance = 'orthodox' | 'southpaw' | 'switch';

export type FightingStyle =
  | 'out-boxer' | 'boxer-puncher' | 'pressure-fighter' | 'slugger'
  | 'counter-puncher' | 'switch-hitter' | 'spoiler';

/** Незмінні фізичні дані. */
export interface FighterConstants {
  heightCm: number;
  reachCm: number;
  stance: Stance;
  naturalWeightClassId: string;
}

/** Форма: швидко й тимчасово (DOMAIN_MODEL.md). */
export interface FighterCondition {
  /** 0–100 */
  sharpness: number;
  /** 0–100 */
  freshness: number;
  weightKg: number;
}

/** Знос: тільки вгору, незворотно. */
export interface FighterWear {
  /** 0–100, накопичена шкода голові за кар'єру */
  headTrauma: number;
  /** 0–100 */
  bodyWear: number;
  roundsBoxed: number;
}

export interface FighterRecord {
  wins: number;
  losses: number;
  draws: number;
  knockouts: number;
}

export interface Fighter {
  /** Незмінний ідентифікатор, не позиція в масиві. */
  id: string;
  name: string;
  countryCode: string;
  age: number;
  constants: FighterConstants;
  attributes: Attributes;
  condition: FighterCondition;
  wear: FighterWear;
  record: FighterRecord;
  style: FightingStyle;
  /**
   * Стеля зростання — діапазон, а не число (DOMAIN_MODEL.md).
   * Одне число рано чи пізно витікає до гравця і перетворює скаутинг на пошук цифри.
   */
  potentialRange: readonly [number, number];
}
