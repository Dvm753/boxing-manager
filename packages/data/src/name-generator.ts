import type { Rng } from '@bm/core-model';
import syllables from './reference/name-syllables.json' with { type: 'json' };

const REGIONS = Object.keys(syllables.regions) as (keyof typeof syllables.regions)[];

export function listRegions(): readonly string[] {
  return REGIONS;
}

/**
 * Складає ім'я зі складів. Пул містить склади, а не імена — це і є виконання ADR-0005:
 * у `packages/data` фізично немає списку реальних людей.
 */
export function generateName(rng: Rng, regionCode: string): string {
  const region = syllables.regions[regionCode as keyof typeof syllables.regions];
  if (!region) throw new Error(`Невідомий регіон: ${regionCode}`);
  const first = rng.pick(region.first) + rng.pick(region.firstEnd);
  const last = rng.pick(region.last) + rng.pick(region.lastEnd);
  return `${first} ${last}`;
}
