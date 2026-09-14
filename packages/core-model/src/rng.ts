/**
 * Детермінований генератор псевдовипадкових чисел (ADR-0003).
 *
 * `Math.random()` заборонений в усіх пакетах рушіїв: він не відтворюваний, тому
 * один seed перестав би давати байт-ідентичний EventLog. Уся випадковість
 * проходить через явно переданий екземпляр Rng.
 */
export interface Rng {
  /** Рівномірно в [0, 1). */
  next(): number;
  /** Ціле в [min, max] включно. */
  int(min: number, max: number): number;
  /** Елемент масиву. Кидає на порожньому масиві — мовчазний undefined приховав би помилку. */
  pick<T>(items: readonly T[]): T;
  /** Наближено нормальний розподіл: сума 3 рівномірних, обрізана в [min, max]. */
  normalInt(min: number, max: number): number;
  /**
   * Непрозорий ідентифікатор у формі UUID v4 (ADR-0013).
   * `crypto.randomUUID()` заборонений: він недетермінований і зламав би ADR-0003.
   */
  uuid(): string;
}

/** mulberry32 — 32-бітний PRNG: компактний, швидкий, з однаковою поведінкою в Node і браузері. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Rng.pick: порожній масив');
      return items[int(0, items.length - 1)] as T;
    },
    normalInt(min: number, max: number): number {
      const avg = (next() + next() + next()) / 3;
      const v = Math.round(min + avg * (max - min));
      return v < min ? min : v > max ? max : v;
    },
    uuid(): string {
      const hex = '0123456789abcdef';
      let out = '';
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue; }
        if (i === 14) { out += '4'; continue; }                      // версія 4
        if (i === 19) { out += hex[8 + int(0, 3)] as string; continue; } // варіант 8/9/a/b
        out += hex[int(0, 15)] as string;
      }
      return out;
    },
  };
}

/** Похідний seed для підсистеми: різні потоки випадковості не корелюють між собою. */
export function deriveSeed(seed: number, label: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}
