import { describe, it, expect } from 'vitest';
import { proposeTitleFights, type TitleCandidate } from '../src/index.js';

const noBooked = (): boolean => false;
const allAvailable = (): boolean => true;
const opts = { proposalWindowDays: 56 };

describe('пропозиція титульних боїв (ADR-0026)', () => {
  it('вакантний пояс: розігрують перший і другий номери', () => {
    const candidates: TitleCandidate[] = [{
      titleKey: 'gbc/welterweight', championId: null, mandatoryDueBy: null,
      ranked: ['f1', 'f2', 'f3'],
    }];
    const proposals = proposeTitleFights(candidates, 100, noBooked, allAvailable, opts);
    expect(proposals).toEqual([{ titleKey: 'gbc/welterweight', aId: 'f1', bId: 'f2', reason: 'vacancy' }]);
  });

  it('вакантний пояс без другого номера — пропозиції немає', () => {
    const candidates: TitleCandidate[] = [{
      titleKey: 'gbc/welterweight', championId: null, mandatoryDueBy: null, ranked: ['f1'],
    }];
    expect(proposeTitleFights(candidates, 100, noBooked, allAvailable, opts)).toEqual([]);
  });

  it('чемпіон: обов\'язковий захист пропонується лише в межах вікна', () => {
    const far: TitleCandidate = {
      titleKey: 'gbc/welterweight', championId: 'champ', mandatoryDueBy: 500,
      ranked: ['champ', 'f2', 'f3'],
    };
    expect(proposeTitleFights([far], 100, noBooked, allAvailable, opts)).toEqual([]);

    const near: TitleCandidate = { ...far, mandatoryDueBy: 130 };
    expect(proposeTitleFights([near], 100, noBooked, allAvailable, opts)).toEqual([
      { titleKey: 'gbc/welterweight', aId: 'champ', bId: 'f2', reason: 'mandatory' },
    ]);
  });

  it('претендент — перший у рейтингу, хто не є самим чемпіоном', () => {
    const candidate: TitleCandidate = {
      titleKey: 'gbc/welterweight', championId: 'champ', mandatoryDueBy: 110,
      ranked: ['champ', 'f2', 'f3'],
    };
    const proposal = proposeTitleFights([candidate], 100, noBooked, allAvailable, opts)[0];
    expect(proposal?.bId).toBe('f2');
  });

  it('зайнятий чемпіон — захист не пропонується цього тижня', () => {
    const candidate: TitleCandidate = {
      titleKey: 'gbc/welterweight', championId: 'champ', mandatoryDueBy: 110,
      ranked: ['champ', 'f2'],
    };
    const isBooked = (id: string): boolean => id === 'champ';
    expect(proposeTitleFights([candidate], 100, isBooked, allAvailable, opts)).toEqual([]);
  });

  it('той самий боєць не потрапляє у дві пропозиції за один тиждень', () => {
    // Один боєць — топ-1 у вакантному поясі body A і топ-2 у вакантному поясі body B.
    const candidates: TitleCandidate[] = [
      { titleKey: 'gbc/welterweight', championId: null, mandatoryDueBy: null, ranked: ['shared', 'f2'] },
      { titleKey: 'uba/welterweight', championId: null, mandatoryDueBy: null, ranked: ['f3', 'shared'] },
    ];
    const proposals = proposeTitleFights(candidates, 100, noBooked, allAvailable, opts);
    const usedTwice = proposals.flatMap((p) => [p.aId, p.bId]).filter((id) => id === 'shared').length;
    expect(usedTwice).toBeLessThanOrEqual(1);
  });

  it('недоступний претендент пропускається на користь наступного в рейтингу', () => {
    const candidate: TitleCandidate = {
      titleKey: 'gbc/welterweight', championId: 'champ', mandatoryDueBy: 110,
      ranked: ['champ', 'f2', 'f3'],
    };
    const isAvailable = (id: string): boolean => id !== 'f2';
    const proposal = proposeTitleFights([candidate], 100, noBooked, isAvailable, opts)[0];
    expect(proposal?.bId).toBe('f3');
  });
});
