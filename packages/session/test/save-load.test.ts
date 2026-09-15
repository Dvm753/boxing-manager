import { describe, it, expect } from 'vitest';
import { createRng } from '@bm/core-model';
import { advanceDay } from '@bm/engine-world';
import { buildWorld, runSeason } from '@bm/sim-cli';
import {
  CURRENT_SCHEMA_VERSION, ReferenceMismatchError, SaveSchemaError,
  describeSave, loadCareer, migrate, saveCareer,
} from '../src/index.js';

const seasoned = runSeason(buildWorld(2026, 400), 200).world;

describe('збереження і відкриття (ADR-0004)', () => {
  it('зберегти → відкрити → зберегти дає байт-ідентичний результат', () => {
    const once = saveCareer(seasoned);
    const twice = saveCareer(loadCareer(once));
    expect(twice).toBe(once);
  });

  it('відкритий світ рівний збереженому', () => {
    const restored = loadCareer(saveCareer(seasoned));
    expect(restored.day).toBe(seasoned.day);
    expect(Object.keys(restored.fighters).length).toBe(Object.keys(seasoned.fighters).length);
    expect(restored.news.length).toBe(seasoned.news.length);
    expect(Object.keys(restored.rankings).length).toBe(Object.keys(seasoned.rankings).length);
  });

  it('симуляція після відкриття йде тим самим шляхом — сейв не ламає детермінізм', () => {
    const direct = advanceDay(seasoned, [], createRng(5));
    const restored = advanceDay(loadCareer(saveCareer(seasoned)), [], createRng(5));
    expect(JSON.stringify(restored.events)).toBe(JSON.stringify(direct.events));
    expect(saveCareer(restored.world)).toBe(saveCareer(direct.world));
  });

  it('три ігрові роки: сейв відкривається і гра продовжується', () => {
    // Критерій завершення фази 1 із ROADMAP.md.
    let world = buildWorld(7, 300);
    for (let year = 0; year < 3; year++) {
      world = runSeason(world, 365).world;
      world = loadCareer(saveCareer(world)); // перезапуск між роками
    }
    expect(world.day).toBe(buildWorld(7, 300).day + 365 * 3);
    const summary = describeSave(saveCareer(world));
    expect(summary.fightsRecorded).toBeGreaterThan(0);
    expect(summary.fighterCount).toBe(300);
  });

  it('опис сейву читається без повного відновлення', () => {
    const summary = describeSave(saveCareer(seasoned));
    expect(summary.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(summary.savedOnDay).toBe(seasoned.day);
    expect(summary.referenceVersion).toBe(1);
  });
});

describe('версії й міграції', () => {
  it('сейв без версії не відкривається', () => {
    expect(() => loadCareer(JSON.stringify({ world: {} }))).toThrow(SaveSchemaError);
  });

  it('сейв із майбутньої версії дає зрозумілу помилку, а не тихий збій', () => {
    const future = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    future['schemaVersion'] = CURRENT_SCHEMA_VERSION + 1;
    expect(() => loadCareer(JSON.stringify(future))).toThrow(/новіший за підтримувану/);
  });

  it('пошкоджений JSON дає помилку схеми, а не виняток парсера', () => {
    expect(() => loadCareer('{ це не json')).toThrow(SaveSchemaError);
  });

  it('migrate не чіпає сейв поточної версії', () => {
    const raw = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    expect(migrate(raw)['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('відбиток довідників', () => {
  it('інша версія довідників не відкривається мовчки', () => {
    const save = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    (save['stamp'] as Record<string, unknown>)['referenceVersion'] = 99;
    expect(() => loadCareer(JSON.stringify(save))).toThrow(ReferenceMismatchError);
  });

  it('інший набір органів не відкривається мовчки', () => {
    const save = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    (save['stamp'] as Record<string, unknown>)['sanctioningBodyIds'] = ['gbc'];
    expect(() => loadCareer(JSON.stringify(save))).toThrow(/санкційних органів/);
  });

  it('розбіжність можна обійти явно, але тільки свідомо', () => {
    const save = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    (save['stamp'] as Record<string, unknown>)['referenceVersion'] = 99;
    const world = loadCareer(JSON.stringify(save), { allowReferenceMismatch: true });
    expect(world.day).toBe(seasoned.day);
  });

  it('сейв без відбитка відхиляється', () => {
    const save = JSON.parse(saveCareer(seasoned)) as Record<string, unknown>;
    delete save['stamp'];
    expect(() => loadCareer(JSON.stringify(save))).toThrow(ReferenceMismatchError);
  });
});

describe('налаштування подання не входять у сейв (ADR-0019)', () => {
  it('у тексті сейву немає мови, теми, одиниць і валюти', () => {
    const text = saveCareer(seasoned);
    for (const token of ['"locale"', '"theme"', '"units"', '"currency"', 'imperial', 'metric']) {
      expect(text.includes(token), `знайдено ${token}`).toBe(false);
    }
  });
});
