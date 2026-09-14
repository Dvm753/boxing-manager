# Контракти між модулями

> Кожна межа — явний інтерфейс. Зміна інтерфейсу = ADR.

| Модуль | Відповідальність | Заборонено |
|---|---|---|
| `core-model` | сутності, типи, схеми, валідація | будь-яка логіка симуляції |
| `data` | JSON-довідники, генератор світу | залежність від UI або рушіїв |
| `engine-fight` | симуляція одного бою | доступ до світу, календаря, грошей, рейтингів |
| `ai` | політики рішень промоутерів, менеджерів і бійців | знання про внутрішню будову рушіїв; будь-який стан |
| `engine-world` | тік дня, економіка, рейтинги; звертається до `ai` за рішеннями | знання про внутрішню будову рушія бою |
| `session` | команди гравця, збереження, undo | правила домену |
| `i18n` | словники подання, множина, підстановка | залежність від симуляції; будь-яка логіка домену |
| `apps/web` | екрани | будь-які обчислення правил |

## Основні сигнатури (чернетка)

```ts
// engine-fight
simulateFight(
  a: FighterSnapshot,
  b: FighterSnapshot,
  context: FightContext,   // раунди, правила комісії, судді, місце, ставки
  rng: Rng
): { result: FightResult; eventLog: FightEvent[] }

// engine-world
advanceDay(world: World, commands: PlayerCommand[], rng: Rng): { world: World; events: WorldEvent[] }

// переговори — однакові для гравця і ШІ
proposeFight(offer: FightOffer): NegotiationState
respondToOffer(state: NegotiationState, response: OfferResponse): NegotiationState
```

`FighterSnapshot` — **зліпок**, а не посилання на живу сутність. Рушій бою не може мутувати світ.
