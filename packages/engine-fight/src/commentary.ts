import type { FightEvent, FighterSide, LandQuality, PunchType } from './types.js';

/**
 * Текстовий коментар бою (play-by-play) — **похідна від `EventLog`**, а не окреме
 * джерело правди. Той самий лог завжди дає той самий коментар: тут немає випадковості
 * взагалі, тому коментар можна відтворити з сейву, не зберігаючи його (ADR-0003).
 *
 * Рушій не знає мови (ADR-0017): рядок несе **ключ і параметри**, як новини світу.
 */
export interface CommentaryLine {
  round: number;
  /**
   * Секунда всередині раунду, 0–180 (закриває Q30). `null` — рядок не прив'язаний
   * до миті (підсумок раунду, вердикт): показувати час поруч із ним нема сенсу.
   */
  second: number | null;
  key: string;
  /** Значення підстановок: числа і сторони бійців (`a` / `b`). */
  params: Record<string, string | number>;
  /**
   * Підстановки, значення яких самі є ключами перекладу — тип удару, позиція,
   * місце розсічення. Подання перекладає їх перед підстановкою.
   */
  keyParams?: Record<string, string>;
}

export interface CommentaryOptions {
  /**
   * Скільки помітних ударів показувати за раунд. Повний лог — це ~600 ударів за бій;
   * читати його неможливо, тому коментар **відбирає**, а не переказує.
   */
  notablePerRound?: number;
  /** Рядок із підсумком раунду за кинутими й влучними ударами. */
  roundSummary?: boolean;
}

const DEFAULTS: Required<CommentaryOptions> = { notablePerRound: 3, roundSummary: true };

/** Порядок вагомості: що вище, то раніше удар потрапляє в добірку раунду. */
const NOTABLE_RANK: Partial<Record<LandQuality, number>> = { clean: 1, heavy: 2, critical: 3 };

interface Tally { thrown: number; landed: number }

const emptyTally = (): Tally => ({ thrown: 0, landed: 0 });

const LANDED: readonly LandQuality[] = ['partial', 'glancing', 'clean', 'heavy', 'critical'];

interface Buffered {
  /** Порядок у лозі — за ним рядки повертаються до хронології після відбору. */
  order: number;
  line: CommentaryLine;
  /** Відсутній у подій, які не можна відкинути (нокдаун, розсічення, приголомшення). */
  rank?: number;
}

/**
 * Картки всіх трьох суддів як готові рядки "10–9" (закриває Q31: досі показувався
 * лише перший суддя з трьох). Формат числа тут — не локалізація: параметри рядка
 * перекладу приймають лише `string | number`, а сама пара — не та величина, яку
 * потрібно форматувати за мовою користувача.
 */
const cardParams = (
  cards: readonly (readonly [number, number])[],
): { j1: string; j2: string; j3: string } => {
  const label = (c: readonly [number, number] | undefined): string => c === undefined ? '—' : `${c[0]}–${c[1]}`;
  return { j1: label(cards[0]), j2: label(cards[1]), j3: label(cards[2]) };
};

const punchLine = (
  round: number, second: number, by: FighterSide, punch: PunchType, quality: LandQuality, position: string,
): CommentaryLine => ({
  round, second,
  key: `commentary.land.${quality}`,
  params: { fighter: by },
  keyParams: { punch: `punch.${punch}`, position: `position.${position}` },
});

/**
 * Перетворює лог бою на добірку рядків.
 *
 * Відбір робиться **посеансово за раундом**: спершу збираються всі кандидати раунду,
 * потім лишаються `notablePerRound` найвагоміших ударів, і лише після цього рядки
 * повертаються до хронологічного порядку. Через це критичне влучання наприкінці
 * раунду не втрачається через три чисті влучання на його початку.
 */
export function buildCommentary(
  eventLog: readonly FightEvent[], options: CommentaryOptions = {},
): readonly CommentaryLine[] {
  const { notablePerRound, roundSummary } = { ...DEFAULTS, ...options };
  const out: CommentaryLine[] = [];

  let round = 0;
  let buffer: Buffered[] = [];
  let tallyA = emptyTally();
  let tallyB = emptyTally();
  let order = 0;
  /**
   * Приголомшення повторюється по кілька разів за раунд і перетворює репортаж на шум.
   * Показуємо перше за раунд на кожного бійця: далі воно вже не новина.
   */
  let stunned = new Set<FighterSide>();

  const flush = (cards?: readonly (readonly [number, number])[]): void => {
    // Порожній раунд не породжує рядків: інакше лог, що завершився рішенням,
    // отримував би зайвий підсумок із нулями після останнього раунду.
    if (round === 0 || (buffer.length === 0 && tallyA.thrown === 0 && tallyB.thrown === 0)) {
      if (cards === undefined) return;
      out.push({ round, second: 180, key: 'commentary.roundEnd', params: { round, ...cardParams(cards) } });
      return;
    }
    const notable = buffer
      .filter((b) => b.rank !== undefined)
      .sort((x, y) => (y.rank as number) - (x.rank as number) || x.order - y.order)
      .slice(0, notablePerRound);
    const keptOrders = new Set(notable.map((b) => b.order));
    for (const item of buffer) {
      if (item.rank === undefined || keptOrders.has(item.order)) out.push(item.line);
    }
    if (roundSummary) {
      out.push({
        round, second: null,
        key: 'commentary.roundSummary',
        params: {
          a: 'a', b: 'b',
          landedA: tallyA.landed, thrownA: tallyA.thrown,
          landedB: tallyB.landed, thrownB: tallyB.thrown,
        },
      });
    }
    if (cards !== undefined) {
      out.push({ round, second: 180, key: 'commentary.roundEnd', params: { round, ...cardParams(cards) } });
    }
    buffer = [];
    tallyA = emptyTally();
    tallyB = emptyTally();
    stunned = new Set<FighterSide>();
  };

  for (const event of eventLog) {
    switch (event.t) {
      case 'roundStart':
        round = event.round;
        out.push({ round, second: 0, key: 'commentary.roundStart', params: { round } });
        break;

      case 'punch': {
        const tally = event.by === 'a' ? tallyA : tallyB;
        tally.thrown += 1;
        if (LANDED.includes(event.quality)) tally.landed += 1;
        const rank = NOTABLE_RANK[event.quality];
        if (rank !== undefined) {
          buffer.push({
            order: order++,
            rank,
            line: punchLine(event.round, event.second, event.by, event.punch, event.quality, event.position),
          });
        }
        break;
      }

      case 'knockdown':
        buffer.push({
          order: order++,
          line: {
            round: event.round, second: event.second, key: 'commentary.knockdown',
            params: { fighter: event.by, count: event.count },
          },
        });
        break;

      case 'stun':
        if (stunned.has(event.on)) break;
        stunned.add(event.on);
        buffer.push({
          order: order++,
          line: {
            round: event.round, second: event.second, key: 'commentary.stun', params: { fighter: event.on },
          },
        });
        break;

      case 'cut':
        buffer.push({
          order: order++,
          line: {
            round: event.round, second: event.second, key: 'commentary.cut',
            params: { fighter: event.on }, keyParams: { location: `cut.${event.location}` },
          },
        });
        break;

      case 'planChange':
        buffer.push({
          order: order++,
          line: {
            round: event.round, second: event.second, key: 'commentary.planChange',
            params: { fighter: event.by },
          },
        });
        break;

      case 'roundEnd':
        flush(event.cards);
        break;

      case 'stoppage':
        flush();
        out.push({
          round: event.round, second: event.second,
          key: `commentary.stoppage.${event.reason}`,
          params: { fighter: event.winner, round: event.round },
        });
        break;

      case 'decision':
        flush();
        out.push({
          round, second: null,
          key: `commentary.decision.${event.kind}`,
          params: event.winner === null ? {} : { fighter: event.winner },
        });
        break;
    }
  }

  // Лог, що обірвався без `roundEnd`, `stoppage` чи `decision`, не мовчить:
  // накопичене все одно виводиться. Сейв із пошкодженим логом не має зникати з екрана.
  flush();
  return out;
}
