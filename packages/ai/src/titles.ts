/**
 * Пропозиція титульних боїв (ADR-0026). `ai` **не імпортує `engine-world`** (ADR-0002),
 * тому стан пояса й рейтинг приходять простими структурами, як і решта пакета.
 *
 * Пуре, без випадковості: порядок кандидатів повністю визначений рейтингом, тож
 * і результат цієї функції визначений повністю — жодного `rng` тут не потрібно.
 */
export interface TitleCandidate {
  titleKey: string;
  /** `null` — вакантний. */
  championId: string | null;
  /** `null` — без чемпіона обов'язковий захист не має сенсу. */
  mandatoryDueBy: number | null;
  /** Топ рейтингу цього органу й категорії, від першого номера, лише fighterId. */
  ranked: readonly string[];
}

export interface TitleFightProposal {
  titleKey: string;
  aId: string;
  bId: string;
  /** Заповнення вакансії чи обов'язковий захист — різні новини й різний сенс для гравця. */
  reason: 'vacancy' | 'mandatory';
}

export interface ProposeTitleFightsOptions {
  /**
   * За скільки днів до дедлайну обов'язковий захист починають пропонувати.
   * Це **не** те саме, що вікно домовленості (`SCHEDULE_LEAD_DAYS`): якщо чекати
   * рівно до нього, будь-яка затримка — чемпіон чи претендент зайняті того тижня —
   * зсуває бій за дедлайн, і чемпіона стягують за день до власного захисту.
   * Тому вікно пропозиції ширше за вікно домовленості — дає кілька спроб.
   */
  proposalWindowDays: number;
}

/**
 * Титульні бої на цей тиждень: заповнення вакансій і термінові обов'язкові захисти.
 * Порядок кандидатів (сортованих викликачем за `titleKey`) визначає порядок пропозицій,
 * а не якийсь пріоритет — це просто фіксує детермінізм.
 */
export function proposeTitleFights(
  candidates: readonly TitleCandidate[],
  day: number,
  isBooked: (fighterId: string) => boolean,
  isAvailable: (fighterId: string) => boolean,
  options: ProposeTitleFightsOptions,
): readonly TitleFightProposal[] {
  const proposals: TitleFightProposal[] = [];
  // Один боєць може бути чемпіоном чи претендентом одразу в кількох органах тієї самої
  // категорії. Без власного стану booking двоє різних тіл запропонували б йому два бої
  // в один тиждень — і бо́юся боєць вийшов би в ринг двічі того самого дня.
  const takenThisWeek = new Set<string>();
  const taken = (id: string): boolean => isBooked(id) || takenThisWeek.has(id);

  for (const candidate of candidates) {
    const contenders = candidate.ranked.filter((id) => !taken(id) && isAvailable(id));

    if (candidate.championId === null) {
      // Вакантний пояс: розігрують перший і другий номери, якщо обидва вільні.
      const [first, second] = contenders;
      if (first === undefined || second === undefined) continue;
      takenThisWeek.add(first);
      takenThisWeek.add(second);
      proposals.push({ titleKey: candidate.titleKey, aId: first, bId: second, reason: 'vacancy' });
      continue;
    }

    if (candidate.mandatoryDueBy === null) continue;
    if (candidate.mandatoryDueBy - day > options.proposalWindowDays) continue;
    if (taken(candidate.championId) || !isAvailable(candidate.championId)) continue;

    const challenger = contenders.find((id) => id !== candidate.championId);
    if (challenger === undefined) continue;
    takenThisWeek.add(candidate.championId);
    takenThisWeek.add(challenger);
    proposals.push({
      titleKey: candidate.titleKey, aId: candidate.championId, bId: challenger, reason: 'mandatory',
    });
  }

  return proposals;
}
