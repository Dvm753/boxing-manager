import type { World } from '@bm/engine-world';

/**
 * Формат збережень (ADR-0004). Сейв ділиться на дві незалежні частини:
 * `world` — статичні довідники, `career` — усе, що змінюється під час гри.
 *
 * Налаштування подання (мова, одиниці, валюта, тема) у сейв **не входять** — ADR-0019:
 * кар'єра, збережена в метричній системі, відкривається в імперській без міграції.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/** Відбиток довідників: кар'єра, відкрита з іншими коефіцієнтами, втратила б відтворюваність. */
export interface WorldReferenceStamp {
  /** Версія набору довідників. */
  referenceVersion: number;
  weightClassCount: number;
  sanctioningBodyIds: readonly string[];
}

export interface CareerSave {
  schemaVersion: number;
  savedOnDay: number;
  stamp: WorldReferenceStamp;
  world: World;
}

export class SaveSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveSchemaError';
  }
}

export class ReferenceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceMismatchError';
  }
}
