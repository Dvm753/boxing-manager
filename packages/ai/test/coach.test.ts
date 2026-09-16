import { describe, it, expect } from 'vitest';
import { createRng, type Fighter } from '@bm/core-model';
import { generateWorld } from '@bm/data';
import { coachSuitability } from '../src/index.js';

/**
 * Тренер і придатність плану (ADR-0028). Скіл тренера впливає лише на шум навколо
 * «правдивої» оцінки — сам бій і вибір гравця цей розрахунок не змінює.
 */
const world = generateWorld(2026, 300);
const fighters = world.fighters as readonly Fighter[];

describe('придатність плану й сценарію (ADR-0028)', () => {
  it('результат завжди в межах 0–100', () => {
    for (const f of fighters.slice(0, 30)) {
      for (const plan of ['distance', 'pressure', 'counter'] as const) {
        for (const scenario of ['A', 'B', 'C'] as const) {
          const v = coachSuitability(f, plan, scenario, 10, createRng(1));
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('skill=20 дає точний результат без шуму — не залежить від seed rng', () => {
    const f = fighters[0] as Fighter;
    const one = coachSuitability(f, 'pressure', 'B', 20, createRng(1));
    const two = coachSuitability(f, 'pressure', 'B', 20, createRng(999999));
    expect(one).toBe(two);
  });

  it('той самий rng і ті самі входи дають той самий результат (детермінізм)', () => {
    const f = fighters[5] as Fighter;
    const one = coachSuitability(f, 'counter', 'C', 5, createRng(42));
    const two = coachSuitability(f, 'counter', 'C', 5, createRng(42));
    expect(one).toBe(two);
  });

  it('низький skill дає ширший розкид оцінок за різних seed, ніж високий', () => {
    const f = fighters[10] as Fighter;
    const spread = (skill: number): number => {
      const values = Array.from({ length: 40 }, (_, i) => coachSuitability(f, 'distance', 'A', skill, createRng(i)));
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(2)).toBeGreaterThan(spread(19));
  });

  it('бійцю з осями, що явно тягнуть у бік плану, план оцінюється вище за протилежний', () => {
    // Синтетичний боєць: осі максимально «тиск» (high pressure/preferredRange/punchVolume),
    // атрибути під тиск теж максимальні — придатність "pressure" має перевищити "distance".
    const base = fighters[0] as Fighter;
    const pressureFighter: Fighter = {
      ...base,
      styleAxes: { ...base.styleAxes, preferredRange: 20, pressure: 20, punchVolume: 20, counterTendency: 1 },
      attributes: { ...base.attributes, workRate: 20, stamina: 20, aggression: 20 },
      condition: { ...base.condition, sharpness: 90, freshness: 90 },
    };
    const pressureScore = coachSuitability(pressureFighter, 'pressure', 'B', 20, createRng(1));
    const distanceScore = coachSuitability(pressureFighter, 'distance', 'B', 20, createRng(1));
    expect(pressureScore).toBeGreaterThan(distanceScore);
  });
});
