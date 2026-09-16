import { describe, it, expect } from 'vitest';
import { createRng } from '@bm/core-model';
import { CONDITION_TUNING } from '@bm/data';
import {
  advanceDay, buildTierIndex, offerDecisionId, type PlayerCommand, type World,
} from '@bm/engine-world';
import {
  createWorld, startCareer, playerStable, saveCareer, loadCareer, UnknownFighterError,
} from '../src/index.js';

const world = createWorld(4242, 60);
const ids = Object.keys(world.fighters).sort();
const me = ids[0] as string;
const foe = ids[1] as string;

/**
 * Бій підопічному не призначається — він **пропонується** (ADR-0023), тому тест
 * спершу отримує пропозицію, а потім її приймає. Два дні, а не один.
 */
const withFight = (base: World, inDays: number): World => {
  const offer: PlayerCommand = {
    t: 'scheduleFight',
    fight: { id: 'bout-1', day: base.day + inDays, aId: me, bId: foe, scheduledRounds: 10 },
  };
  const offered = advanceDay(base, [offer], createRng(1)).world;
  return advanceDay(offered, [{ t: 'acceptOffer', decisionId: offerDecisionId('bout-1') }], createRng(1)).world;
};

describe('кар\'єра і стайбл гравця', () => {
  it('новий світ не має підопічних', () => {
    expect(world.playerFighterIds).toEqual([]);
    expect(playerStable(world)).toEqual([]);
  });

  it('невідомий боєць — помилка, а не мовчазне ігнорування', () => {
    expect(() => startCareer(world, 'нема-такого')).toThrow(UnknownFighterError);
  });

  it('узяти бійця двічі — те саме, що взяти один раз', () => {
    const once = startCareer(world, me);
    expect(startCareer(once, me)).toBe(once);
    expect(once.playerFighterIds).toEqual([me]);
  });

  it('бої підопічного рахуються повністю — рівень 1 (ADR-0015)', () => {
    // Світ більший: у маленькому всі бійці й так потрапляють у топ-12 своєї категорії,
    // і перевірка пройшла б без опіки, нічого не довівши.
    const big = createWorld(7, 600);
    const base = buildTierIndex(big);
    const plain = Object.keys(big.fighters).sort().find((id) => base.get(id) !== 1) as string;
    expect(base.get(plain)).not.toBe(1);
    expect(buildTierIndex(startCareer(big, plain)).get(plain)).toBe(1);
  });

  it('стайбл показує наступний бій і скільки лишилось', () => {
    const mine = withFight(startCareer(world, me), 30);
    const [view] = playerStable(mine);
    expect(view?.nextFight?.opponentId).toBe(foe);
    expect(view?.nextFight?.daysAway).toBe(28);
    expect(view?.nextFight?.scheduledRounds).toBe(10);
  });

  it('прогрес табору — null до відкриття вікна і росте всередині', () => {
    const window = CONDITION_TUNING.sharpness.campWindowDays;
    const early = playerStable(withFight(startCareer(world, me), window + 20))[0];
    const inside = playerStable(withFight(startCareer(world, me), window - 10))[0];
    expect(early?.nextFight?.campProgress).toBeNull();
    expect(inside?.nextFight?.campProgress).toBeGreaterThan(0);
    expect(inside?.nextFight?.campProgress).toBeLessThanOrEqual(1);
  });

  it('готовність — це відстань до власної стелі, а не абсолютне число', () => {
    const [view] = playerStable(startCareer(world, me));
    expect(view?.readiness).toBeGreaterThan(0);
    expect(view?.readiness).toBeLessThanOrEqual(1);
  });

  it('стайбл — похідна: він не зберігається, а рахується зі світу', () => {
    const mine = startCareer(world, me);
    const text = saveCareer(mine);
    expect(text).not.toContain('readiness');
    expect(playerStable(loadCareer(text))).toEqual(playerStable(mine));
  });

  it('підопічний переживає збереження і відкриття', () => {
    const mine = startCareer(world, me);
    expect(loadCareer(saveCareer(mine)).playerFighterIds).toEqual([me]);
  });

  it('після боїв стайбл показує останні п\'ять, найновіші першими', () => {
    let current = startCareer(world, me);
    for (let i = 0; i < 6; i++) {
      current = {
        ...current,
        history: {
          ...current.history,
          [me]: [...(current.history[me] ?? []), {
            fightId: `f${i}`, day: current.day + i, opponentId: foe, method: 'UD' as const,
            won: true, endingRound: 10, scheduledRounds: 10, tier: 1 as const,
          }],
        },
      };
    }
    const [view] = playerStable(current);
    expect(view?.recentFights).toHaveLength(5);
    expect(view?.recentFights[0]?.fightId).toBe('f5');
  });
});

describe('травма в таборі знімає бій (ADR-0023)', () => {
  it('сейв переживає табір і чергу рішень', () => {
    const start = startCareer(world, me);
    const offered = advanceDay(start, [{
      t: 'scheduleFight',
      fight: { id: 'bout-2', day: start.day + 40, aId: me, bId: foe, scheduledRounds: 12 },
    }], createRng(1)).world;
    const accepted = advanceDay(offered, [{
      t: 'acceptOffer', decisionId: offerDecisionId('bout-2'),
    }], createRng(1)).world;

    const reopened = loadCareer(saveCareer(accepted));
    expect(reopened.camps).toEqual(accepted.camps);
    expect(reopened.decisions).toEqual(accepted.decisions);
    expect(playerStable(reopened)).toEqual(playerStable(accepted));
  });

  it('стара кар\'єра без таборів відкривається через міграцію', () => {
    const text = saveCareer(startCareer(world, me));
    const parsed = JSON.parse(text) as Record<string, unknown>;
    parsed['schemaVersion'] = 1;
    const inner = parsed['world'] as Record<string, unknown>;
    delete inner['camps'];
    delete inner['decisions'];
    const reopened = loadCareer(JSON.stringify(parsed));
    expect(reopened.camps).toEqual([]);
    expect(reopened.decisions).toEqual([]);
    expect(reopened.playerFighterIds).toEqual([me]);
  });
});
