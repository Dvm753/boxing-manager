import raw from './reference/weight-classes.json' with { type: 'json' };

export type WeightGroup = 'light' | 'middle' | 'heavy';

/**
 * Без назв для людини (ADR-0017): подання бере їх із `@bm/i18n`
 * за ключем `weightClass.<id>`.
 */
export interface WeightClass {
  id: string;
  /** 0 для важкої ваги — верхньої межі немає. */
  limitKg: number;
  group: WeightGroup;
}

export const WEIGHT_CLASSES: readonly WeightClass[] = raw as WeightClass[];

export function weightClassById(id: string): WeightClass {
  const found = WEIGHT_CLASSES.find((w) => w.id === id);
  if (!found) throw new Error(`Невідома вагова категорія: ${id}`);
  return found;
}
