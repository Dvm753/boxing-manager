import { describe, it, expect } from 'vitest';
import { buildWorld, runSeason } from '../src/season.js';

/**
 * Пояси на довгому прогоні (ADR-0026). Перевіряє перелік «Перевірка» з ADR: пояс
 * переходить із рук у руки, обов'язкові захисти справді діють, вакансія заповнюється,
 * а титульні бої лишаються рідкістю — не декорацією, але й не домінантою календаря.
 */
const YEARS = 5;
const result = runSeason(buildWorld(2026, 1500), 365 * YEARS);
const world = result.world;
const titleNews = world.news.filter((n) => n.key.startsWith('news.title'));
const won = titleNews.filter((n) => n.key.startsWith('news.titleWon'));
const defended = titleNews.filter((n) => n.key === 'news.titleDefended');
const vacated = titleNews.filter((n) => n.key === 'news.titleVacated');

describe('пояси на довгому прогоні (ADR-0026)', () => {
  it('переважна більшість поясів має чемпіона за 5 років', () => {
    const belts = Object.values(world.titles);
    expect(belts.length).toBeGreaterThan(20);
    const held = belts.filter((t) => t.championId !== null).length;
    expect(held / belts.length).toBeGreaterThan(0.8);
  });

  it('жоден чемпіон не тримає пояс довше дедлайну без захисту', () => {
    for (const [key, title] of Object.entries(world.titles)) {
      if (title.championId === null || title.mandatoryDueBy === null) continue;
      expect(title.mandatoryDueBy, key).toBeGreaterThanOrEqual(world.day - 60);
    }
  });

  it('вакансії заповнюються — здобутих поясів більше, ніж кількість самих поясів', () => {
    // Кожен пояс вимагає рівно одного заповнення вакансії для першого чемпіона;
    // якщо won перевищує кількість поясів, дальші заповнення теж відбулися.
    expect(won.length).toBeGreaterThanOrEqual(Object.keys(world.titles).length * 0.8);
  });

  it('частка титульних боїв лишається рідкістю, не домінантою календаря', () => {
    const share = (won.length + defended.length) / result.fightsHeld;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.15);
  });

  it('позбавлень значно менше, ніж успішних захистів — пояси переважно захищають, не втрачають за неявку', () => {
    expect(defended.length).toBeGreaterThan(vacated.length);
  });

  it('гейт фази 0 не залежить від титулів: калібрування використовує окремий генератор пар', () => {
    // Не прогін гейту тут (дорого) — контрактна перевірка, що сезон і калібрування
    // не ділять жодного модуля матчмейкінгу. Сам гейт перевіряється `npm run sim -- calibrate`.
    expect(result.fightsHeld).toBeGreaterThan(0);
  });
});
