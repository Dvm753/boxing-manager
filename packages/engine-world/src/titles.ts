import { bodyById } from '@bm/data';
import type { TitleState, World, WorldEvent } from './types.js';

/** Пояс лежить під ключем `<bodyId>/<weightClassId>`, той самий, що й у `world.rankings`. */
export function parseTitleKey(titleKey: string): { bodyId: string; weightClassId: string } {
  const slash = titleKey.indexOf('/');
  return { bodyId: titleKey.slice(0, slash), weightClassId: titleKey.slice(slash + 1) };
}

/** Вакантний пояс: `since` — день, коли він **став** вакантним (заснування або позбавлення). */
export const vacantTitle = (day: number): TitleState =>
  ({ championId: null, since: day, defences: 0, mandatoryDueBy: null });

export const titleAt = (world: World, titleKey: string): TitleState =>
  world.titles[titleKey] ?? vacantTitle(world.day);

/**
 * Перевірка обов'язкових захистів (ADR-0026). Пуре, детерміноване: сканує всі пояси
 * й публікує подію на кожен, чий термін минув без захисту. Викликається раз на місяць,
 * тим самим тактом, що й публікація рейтингів — дешевше й так само працює реальний бокс:
 * комісії не перевіряють дедлайни щодня.
 *
 * Сортування за ключем фіксує порядок подій — інакше порядок залежав би від порядку
 * вставки в об'єкт, а це не частина стану (ADR-0013 діє тут так само, як для боїв).
 */
export function checkMandatoryDefenses(world: World, day: number): readonly WorldEvent[] {
  const events: WorldEvent[] = [];
  const pending = new Set(world.schedule.filter((f) => f.titleKey !== undefined).map((f) => f.titleKey));
  for (const key of Object.keys(world.titles).sort()) {
    const title = world.titles[key] as TitleState;
    if (title.championId === null || title.mandatoryDueBy === null) continue;
    if (title.mandatoryDueBy >= day) continue;
    // Захист уже призначено — комісія не забирає пояс під час підготовки до бою,
    // лише за бездіяльність. Без цього пропозиція, подана впритул до дедлайну,
    // перегонялася б із власним боєм і championa стягували б за мить до захисту.
    if (pending.has(key)) continue;
    events.push({ t: 'TitleVacated', titleKey: key, formerChampionId: title.championId, day });
  }
  return events;
}

/** Нова дата обов'язкового захисту, відлічена від дня цього бою. */
export const nextMandatoryDueBy = (day: number, bodyId: string): number =>
  day + bodyById(bodyId).mandatoryDefenseDays;
