import { describe, it, expect } from 'vitest';
import { proposeCornerAdvice, type SideRoundStats } from '../src/index.js';

/**
 * Порада кута на конкретні дії (ADR-0028): чиста, детермінована функція —
 * без RNG і без даних про плани/сценарії, ті приходять ззовні як межі.
 */
const stats = (over: Partial<SideRoundStats> = {}): SideRoundStats =>
  ({ thrown: 20, landed: 8, power: 3, knockdowns: 0, cuts: 0, stuns: 0, fouls: 0, foulPenalties: 0, ...over });

describe('порада кута між раундами (ADR-0028)', () => {
  it('явно позаду на очках — радить знизити risk у межах сценарію', () => {
    const own = stats({ thrown: 20, landed: 4 });
    const opp = stats({ thrown: 20, landed: 14 });
    const advice = proposeCornerAdvice(own, opp, 80, { maxDelta: { risk: 2 } }, 5, 6);
    expect(advice).toEqual({ fromRound: 5, toRound: 6, axisAdjustments: { risk: -2 } });
  });

  it('вимотаний (низька витривалість) — додатково знижує punchVolume, якщо межа дозволяє', () => {
    const own = stats({ thrown: 20, landed: 10 });
    const opp = stats({ thrown: 20, landed: 10 });
    const advice = proposeCornerAdvice(own, opp, 25, { maxDelta: { risk: 2, punchVolume: 1 } }, 5, 6);
    expect(advice).toEqual({ fromRound: 5, toRound: 6, axisAdjustments: { risk: -2, punchVolume: -1 } });
  });

  it('явно попереду й не вимотаний — радить підняти risk (натиск на зупинку)', () => {
    const own = stats({ thrown: 20, landed: 14 });
    const opp = stats({ thrown: 20, landed: 4 });
    const advice = proposeCornerAdvice(own, opp, 80, { maxDelta: { risk: 2 } }, 5, 6);
    expect(advice).toEqual({ fromRound: 5, toRound: 6, axisAdjustments: { risk: 2 } });
  });

  it('рівний раунд і нормальна витривалість — порад немає', () => {
    const own = stats({ thrown: 20, landed: 8 });
    const opp = stats({ thrown: 20, landed: 8 });
    expect(proposeCornerAdvice(own, opp, 70, { maxDelta: { risk: 2 } }, 5, 6)).toBeNull();
  });

  it('межа сценарію відсутня (0/undefined) — вісь не займається навіть коли є привід', () => {
    const own = stats({ thrown: 20, landed: 4 });
    const opp = stats({ thrown: 20, landed: 14 });
    // Сценарій A міг би не дозволяти чіпати risk узагалі (порожні межі).
    expect(proposeCornerAdvice(own, opp, 80, { maxDelta: {} }, 5, 6)).toBeNull();
  });
});
