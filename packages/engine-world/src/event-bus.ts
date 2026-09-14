import type { World, WorldEvent } from './types.js';

/**
 * Черга подій домену (ADR-0016).
 *
 * Правила, які тут виконуються буквально:
 * - порядок обробки детермінований: FIFO, обробники в оголошеному порядку;
 * - подія, породжена обробником, потрапляє в ту саму чергу;
 * - перевищення глибини каскаду — **помилка, а не мовчазна зупинка**.
 */
export class CascadeDepthExceededError extends Error {
  constructor(depth: number, event: WorldEvent) {
    super(`Глибина каскаду подій перевищила ${depth} на події ${event.t}`);
    this.name = 'CascadeDepthExceededError';
  }
}

export interface HandlerResult {
  world: World;
  emit?: readonly WorldEvent[];
}

/** Обробник змінює лише власний агрегат і повертає похідні події. */
export type EventHandler = (event: WorldEvent, world: World) => HandlerResult;

export const MAX_CASCADE_DEPTH = 8;

export function dispatch(
  world: World,
  initial: readonly WorldEvent[],
  handlers: readonly EventHandler[],
): { world: World; events: WorldEvent[] } {
  let current = world;
  const processed: WorldEvent[] = [];
  const queue: { event: WorldEvent; depth: number }[] = initial.map((event) => ({ event, depth: 0 }));

  while (queue.length > 0) {
    const item = queue.shift() as { event: WorldEvent; depth: number };
    if (item.depth > MAX_CASCADE_DEPTH) throw new CascadeDepthExceededError(MAX_CASCADE_DEPTH, item.event);
    processed.push(item.event);

    for (const handler of handlers) {
      const result = handler(item.event, current);
      current = result.world;
      for (const next of result.emit ?? []) {
        queue.push({ event: next, depth: item.depth + 1 });
      }
    }
  }

  return { world: current, events: processed };
}
