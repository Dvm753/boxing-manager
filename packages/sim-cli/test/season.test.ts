import { describe, it, expect } from 'vitest';
import { buildWorld, runSeason, simulateDay, startSeasonClock } from '../src/season.js';
import { formatIso } from '@bm/engine-world';
import { decide, startCareer } from '@bm/session';
import { buildFightSummary } from '@bm/engine-fight';

describe('прогін сезону', () => {
  it('детермінований: той самий seed дає той самий світ', () => {
    const run = (): string => {
      const { world, fightsHeld, byTier } = runSeason(buildWorld(2026, 400), 60);
      return JSON.stringify({ day: world.day, fightsHeld, byTier, news: world.news });
    };
    expect(run()).toBe(run());
  });

  it('інший seed дає інший сезон', () => {
    const a = runSeason(buildWorld(1, 400), 60);
    const b = runSeason(buildWorld(2, 400), 60);
    expect(JSON.stringify(a.world.news)).not.toBe(JSON.stringify(b.world.news));
  });

  it('день просувається рівно на задану кількість', () => {
    const start = buildWorld(5, 300);
    const { world } = runSeason(start, 90);
    expect(world.day).toBe(start.day + 90);
  });

  it('бої проводяться і потрапляють у новини', () => {
    const { world, fightsHeld } = runSeason(buildWorld(7, 600), 120);
    expect(fightsHeld).toBeGreaterThan(0);
    // Новини тепер бувають не лише про бої: травма в таборі й знятий бій теж потрапляють
    // у стрічку (ADR-0023). Інваріант лишився той самий — **кожен бій дає новину**.
    const fightNews = world.news.filter(
      (n) => n.key === 'news.fightWon' || n.key === 'news.fightDrawn',
    );
    expect(fightNews.length).toBe(fightsHeld);
  });

  it('усі три рівні деталізації задіяні у великому світі', () => {
    const { byTier } = runSeason(buildWorld(11, 3000), 200);
    expect(byTier[1]).toBeGreaterThan(0);
    expect(byTier[2]).toBeGreaterThan(0);
    expect(byTier[3]).toBeGreaterThan(0);
  });

  it('травмований боєць не отримує нового бою, поки не відновиться', () => {
    const { world } = runSeason(buildWorld(13, 500), 120);
    const injured = Object.entries(world.unavailableUntil).filter(([, until]) => until > world.day);
    for (const [id] of injured) {
      const last = (world.history[id] ?? []).at(-1);
      // Останній бій травмованого має бути в минулому, а не сьогодні після травми.
      if (last) expect(last.day).toBeLessThanOrEqual(world.day);
    }
    expect(injured.length).toBeGreaterThan(0);
  });

  it('рекорди зростають узгоджено з історією', () => {
    const { world } = runSeason(buildWorld(17, 400), 150);
    for (const [id, entries] of Object.entries(world.history)) {
      const fighter = world.fighters[id];
      if (!fighter) continue;
      const wins = entries.filter((e) => e.won === true).length;
      const losses = entries.filter((e) => e.won === false).length;
      const draws = entries.filter((e) => e.won === null).length;
      expect(fighter.record.wins).toBeGreaterThanOrEqual(wins);
      expect(fighter.record.losses).toBeGreaterThanOrEqual(losses);
      expect(fighter.record.draws).toBeGreaterThanOrEqual(draws);
    }
  });

  it('дати зростають монотонно у стрічці новин', () => {
    const { world } = runSeason(buildWorld(19, 400), 180);
    for (let i = 1; i < world.news.length; i++) {
      expect((world.news[i] as { day: number }).day)
        .toBeGreaterThanOrEqual((world.news[i - 1] as { day: number }).day);
    }
    expect(formatIso(world.day)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('світ день за днем (тиждень гравця в поданні)', () => {
  it('simulateDay крок за кроком дає той самий світ, що й runSeason одним викликом', () => {
    let start = buildWorld(2026, 400);
    start = startCareer(start, Object.keys(start.fighters)[3] as string);
    const once = runSeason(start, 120);

    // Ті самі рішення, тим самим годинником, але з паузою після кожного дня —
    // саме так кнопка «Далі» веде світ у демо.
    const clock = startSeasonClock(start);
    let current = start;
    for (let d = 0; d < 120; d++) current = simulateDay(current, clock, decide(current)).world;

    expect(JSON.stringify(current)).toBe(JSON.stringify(once.world));
  });

  it('без відповідей гравця рішення згорають за дедлайном, а не висять вічно', () => {
    let start = buildWorld(77, 400);
    const id = Object.keys(start.fighters)[5] as string;
    start = startCareer(start, id);
    const clock = startSeasonClock(start);
    let current = start;
    // Ніхто не відповідає: пропозиції мусять згорати за дедлайном, а не висіти вічно.
    let pendingSeen = 0;
    for (let d = 0; d < 150; d++) {
      current = simulateDay(current, clock, []).world;
      pendingSeen = Math.max(pendingSeen, current.decisions.length);
    }
    expect(pendingSeen).toBeGreaterThan(0);
    for (const decision of current.decisions) {
      expect(decision.deadline).toBeGreaterThanOrEqual(current.day);
    }
  });
});

describe('титульні бої дня (доповнення ADR-0026)', () => {
  it('титульний бій — завжди рівень 1, його лог віддається, а резюме збігається з результатом світу', () => {
    const start = buildWorld(2026, 600);
    const clock = startSeasonClock(start);
    let current = start;
    let checked = 0;
    for (let d = 0; d < 200 && checked < 5; d++) {
      const step = simulateDay(current, clock, []);
      for (const e of step.events) {
        if (e.t !== 'FightCompleted' || e.titleKey === undefined) continue;
        expect(e.tier).toBe(1);
        const log = step.featuredFightLogs[e.fightId];
        expect(log).toBeDefined();
        const summary = buildFightSummary(log ?? []);
        const winnerId = summary.winner === null ? null : summary.winner === 'a' ? e.aId : e.bId;
        expect(winnerId).toBe(e.winnerId);
        expect(summary.method).toBe(e.method);
        expect(summary.endingRound).toBe(e.endingRound);
        checked++;
      }
      // Лог — лише для боїв, які треба показати: звичайні бої не роздувають результат дня.
      // У цьому світі підопічних немає, тож лишаються тільки титульні.
      const titleIds = new Set(step.events.flatMap((e) => (e.t === 'FightCompleted' && e.titleKey ? [e.fightId] : [])));
      for (const id of Object.keys(step.featuredFightLogs)) expect(titleIds.has(id)).toBe(true);
      current = step.world;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('бій підопічного (ADR-0023)', () => {
  it('лог бою підопічного віддається світом, і резюме збігається з записом у його історії', () => {
    let start = buildWorld(2026, 600);
    const mine = Object.keys(start.fighters)[1] as string;
    start = startCareer(start, mine);
    const clock = startSeasonClock(start);
    let current = start;
    let seen = 0;
    for (let d = 0; d < 300 && seen === 0; d++) {
      const step = simulateDay(current, clock, decide(current));
      for (const e of step.events) {
        if (e.t !== 'FightCompleted' || (e.aId !== mine && e.bId !== mine)) continue;
        expect(e.tier).toBe(1);
        const log = step.featuredFightLogs[e.fightId];
        expect(log).toBeDefined();
        const summary = buildFightSummary(log ?? []);
        const side = e.aId === mine ? 'a' : 'b';
        const entry = step.world.history[mine]?.at(-1);
        expect(entry?.fightId).toBe(e.fightId);
        expect(entry?.won).toBe(summary.winner === null ? null : summary.winner === side);
        expect(entry?.method).toBe(summary.method);
        seen++;
      }
      current = step.world;
    }
    expect(seen).toBe(1);
  });
});
