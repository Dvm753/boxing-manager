import type { CareerSave } from './types.js';
import { CURRENT_SCHEMA_VERSION, SaveSchemaError } from './types.js';

/**
 * Каталог міграцій існує **з першого коміту**, навіть коли версія одна (ADR-0004).
 * Додати міграцію потім дорожче, ніж тримати порожній каталог зараз.
 */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** Ключ — версія, з якої мігруємо. Міграція 1 переводить із версії 1 у версію 2. */
export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  /**
   * 1 → 2 (ADR-0023): у світі з'явилися табори підопічних і черга рішень.
   * Стара кар'єра не мала ні того, ні того — і не могла мати: підопічних у ній не було.
   * Тому міграція додає порожні списки, а не намагається щось відновити.
   */
  [1, (save) => {
    const world = save['world'] as Record<string, unknown> | undefined;
    if (world) {
      world['camps'] = world['camps'] ?? [];
      world['decisions'] = world['decisions'] ?? [];
    }
    return save;
  }],
]);

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let version = typeof raw['schemaVersion'] === 'number' ? (raw['schemaVersion'] as number) : 0;
  if (version < 1) {
    throw new SaveSchemaError(`Сейв без версії схеми або з версією ${version} — відкрити неможливо`);
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SaveSchemaError(
      `Сейв версії ${version} новіший за підтримувану ${CURRENT_SCHEMA_VERSION}: оновіть гру`,
    );
  }

  let current = raw;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.get(version);
    if (!step) throw new SaveSchemaError(`Немає міграції з версії ${version}`);
    current = step(current);
    version += 1;
    current['schemaVersion'] = version;
  }
  return current;
}

export const isCareerSave = (value: unknown): value is CareerSave =>
  typeof value === 'object' && value !== null
  && typeof (value as CareerSave).schemaVersion === 'number'
  && typeof (value as CareerSave).world === 'object';
