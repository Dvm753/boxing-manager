import { describe, it, expect } from 'vitest';
import { createTranslator, renderLine, LOCALES } from '../src/index.js';

const line = {
  key: 'commentary.land.heavy',
  params: { fighter: 'a' },
  keyParams: { punch: 'punch.hook', position: 'position.inside' },
};

describe('подання рядків рушія (ADR-0017)', () => {
  it('підставляє ім\'я бійця замість сторони', () => {
    const t = createTranslator('uk', { onMissing: 'throw' });
    expect(renderLine(t, line, { a: 'Богдан Лозовий', b: 'Тарас Гай' }))
      .toBe('Богдан Лозовий — важке влучання (хук, ближній бій)');
  });

  it('перекладає параметри, які самі є ключами, кожною мовою', () => {
    for (const locale of LOCALES) {
      const t = createTranslator(locale, { onMissing: 'throw' });
      const text = renderLine(t, line, { a: 'A' });
      expect(text, `мова ${locale}`).not.toContain('{');
      expect(text, `мова ${locale}`).not.toContain('punch.hook');
    }
  });

  it('невідоме значення підставляється як є — рядок не зникає', () => {
    const t = createTranslator('en', { onMissing: 'throw' });
    expect(renderLine(t, { key: 'commentary.stun', params: { fighter: 'b' } }))
      .toBe('b is stunned');
  });

  it('рядок без параметрів працює', () => {
    const t = createTranslator('en', { onMissing: 'throw' });
    expect(renderLine(t, { key: 'commentary.decision.D' })).toBe('The fight is a draw');
  });
});
