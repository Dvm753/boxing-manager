import { SANCTIONING_BODIES, WEIGHT_CLASSES } from '@bm/data';
import type { World } from '@bm/engine-world';
import { isCareerSave, migrate } from './migrations.js';
import {
  CURRENT_SCHEMA_VERSION, ReferenceMismatchError, SaveSchemaError,
  type CareerSave, type WorldReferenceStamp,
} from './types.js';

/**
 * Версія набору довідників. Підвищується, коли змінюються вагові категорії,
 * санкційні органи або коефіцієнти, від яких залежить відтворюваність.
 */
export const REFERENCE_VERSION = 1;

export function currentStamp(): WorldReferenceStamp {
  return {
    referenceVersion: REFERENCE_VERSION,
    weightClassCount: WEIGHT_CLASSES.length,
    sanctioningBodyIds: SANCTIONING_BODIES.map((b) => b.id).sort(),
  };
}

/**
 * Серіалізація з **упорядкованими ключами**: без цього два однакові світи давали б
 * різні рядки, і перевірка «зберегти → відкрити → зберегти» була б беззмістовною.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function saveCareer(world: World): string {
  const save: CareerSave = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedOnDay: world.day,
    stamp: currentStamp(),
    world,
  };
  return stableStringify(save);
}

export interface LoadOptions {
  /**
   * Дозволити відкриття попри розбіжність довідників. За замовчуванням заборонено:
   * підмінені коефіцієнти зламали б відтворюваність (ADR-0003), і зламали б тихо.
   */
  allowReferenceMismatch?: boolean;
}

export function loadCareer(text: string, options: LoadOptions = {}): World {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SaveSchemaError(`Сейв не є коректним JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new SaveSchemaError('Сейв не є обʼєктом');
  }

  const migrated = migrate(parsed as Record<string, unknown>);
  if (!isCareerSave(migrated)) throw new SaveSchemaError('Сейв не містить стану світу');

  const save = migrated as CareerSave;
  const expected = currentStamp();
  const stamp = save.stamp;

  if (!options.allowReferenceMismatch) {
    if (!stamp) throw new ReferenceMismatchError('Сейв без відбитка довідників');
    if (stamp.referenceVersion !== expected.referenceVersion) {
      throw new ReferenceMismatchError(
        `Сейв зроблено з довідниками версії ${stamp.referenceVersion}, поточна — ${expected.referenceVersion}. `
        + 'Відкриття з іншими коефіцієнтами зламало б відтворюваність симуляції.',
      );
    }
    if (stamp.weightClassCount !== expected.weightClassCount
      || stamp.sanctioningBodyIds.join(',') !== expected.sanctioningBodyIds.join(',')) {
      throw new ReferenceMismatchError(
        'Набір вагових категорій або санкційних органів у сейві не збігається з поточним.',
      );
    }
  }

  return save.world;
}

/** Опис сейву без повного розбору — для списку збережень у меню. */
export interface SaveSummary {
  schemaVersion: number;
  savedOnDay: number;
  fighterCount: number;
  fightsRecorded: number;
  referenceVersion: number | null;
}

export function describeSave(text: string): SaveSummary {
  const parsed = JSON.parse(text) as CareerSave;
  const history = parsed.world?.history ?? {};
  let fights = 0;
  for (const entries of Object.values(history)) fights += entries.length;
  return {
    schemaVersion: parsed.schemaVersion,
    savedOnDay: parsed.savedOnDay,
    fighterCount: Object.keys(parsed.world?.fighters ?? {}).length,
    fightsRecorded: fights,
    referenceVersion: parsed.stamp?.referenceVersion ?? null,
  };
}
