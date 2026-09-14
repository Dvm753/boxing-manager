import {
  ALL_ATTRIBUTES, type Attributes, type Fighter, type FightingStyle, type Rng,
  type Stance, createRng, deriveSeed,
} from '@bm/core-model';
import { generateName, listRegions } from './name-generator.js';
import { WEIGHT_CLASSES, weightClassById } from './weight-classes.js';

const STYLES: readonly FightingStyle[] = [
  'out-boxer', 'boxer-puncher', 'pressure-fighter', 'slugger',
  'counter-puncher', 'switch-hitter', 'spoiler',
];

/**
 * Рівень бійця в піраміді світу. Визначає, навколо якого середнього крутяться атрибути.
 * Піраміда: новачків багато, елітних одиниці.
 */
const TIERS = [
  { id: 'prospect',  share: 0.34, centre: 8,  spread: 3 },
  { id: 'journeyman',share: 0.30, centre: 9,  spread: 3 },
  { id: 'regional',  share: 0.20, centre: 12, spread: 3 },
  { id: 'national',  share: 0.10, centre: 14, spread: 3 },
  { id: 'contender', share: 0.05, centre: 16, spread: 2 },
  { id: 'elite',     share: 0.01, centre: 18, spread: 2 },
] as const;

export type TierId = (typeof TIERS)[number]['id'];

function pickTier(rng: Rng): (typeof TIERS)[number] {
  const roll = rng.next();
  let acc = 0;
  for (const tier of TIERS) {
    acc += tier.share;
    if (roll < acc) return tier;
  }
  return TIERS[0];
}

function generateAttributes(rng: Rng, centre: number, spread: number): Attributes {
  const attributes = {} as Attributes;
  for (const key of ALL_ATTRIBUTES) {
    attributes[key] = rng.normalInt(Math.max(1, centre - spread), Math.min(20, centre + spread));
  }
  return attributes;
}

/**
 * Зсуває атрибути під стиль, щоб стиль був видимий у числах, а не лише в мітці.
 * Це проміжне рішення: осі стилю (ALT_CONCEPT_REVIEW §3.4) ще не погоджені.
 */
function applyStyleBias(attributes: Attributes, style: FightingStyle): void {
  const bump = (key: keyof Attributes, delta: number): void => {
    attributes[key] = Math.max(1, Math.min(20, attributes[key] + delta));
  };
  switch (style) {
    case 'out-boxer': bump('jab', 3); bump('footwork', 3); bump('distanceControl', 2); bump('punchPower', -2); break;
    case 'pressure-fighter': bump('aggression', 3); bump('stamina', 3); bump('insideFighting', 2); bump('distanceControl', -2); break;
    case 'slugger': bump('punchPower', 4); bump('hook', 2); bump('footwork', -3); bump('defensiveDiscipline', -2); break;
    case 'counter-puncher': bump('counterPunching', 4); bump('composure', 2); bump('headMovement', 2); bump('workRate', -2); break;
    case 'boxer-puncher': bump('accuracy', 2); bump('combinations', 2); bump('punchPower', 1); break;
    case 'switch-hitter': bump('adaptability', 3); bump('coordination', 2); break;
    case 'spoiler': bump('clinching', 4); bump('dirtiness', 3); bump('accuracy', -2); break;
  }
}

export interface GeneratedWorld {
  seed: number;
  fighters: readonly Fighter[];
}

/**
 * Генерує світ бійців від одного seed. Той самий seed завжди дає той самий світ —
 * це перевіряється тестом детермінізму (ADR-0003).
 */
export function generateWorld(seed: number, count: number): GeneratedWorld {
  const rng = createRng(deriveSeed(seed, 'world/fighters'));
  const regions = listRegions();
  const fighters: Fighter[] = [];

  for (let i = 0; i < count; i++) {
    const tier = pickTier(rng);
    const style = rng.pick(STYLES);
    const attributes = generateAttributes(rng, tier.centre, tier.spread);
    applyStyleBias(attributes, style);

    const weightClass = rng.pick(WEIGHT_CLASSES);
    const region = rng.pick(regions);
    const age = rng.normalInt(18, 38);
    const stance: Stance = rng.next() < 0.16 ? 'southpaw' : rng.next() < 0.02 ? 'switch' : 'orthodox';

    // Зріст і розмах прив'язані до вагової категорії: 60 кг і 195 см не буває.
    const baseHeight = weightClass.limitKg === 0 ? 191 : 150 + (weightClass.limitKg - 47) * 0.78;
    const heightCm = Math.round(rng.normalInt(-6, 6) + baseHeight);
    const reachCm = heightCm + rng.int(-4, 8);

    const fightsHad = Math.max(0, Math.round((age - 18) * rng.next() * 3.2));
    const wins = Math.round(fightsHad * (0.55 + rng.next() * 0.42));
    const losses = Math.max(0, fightsHad - wins - (rng.next() < 0.12 ? 1 : 0));
    const draws = Math.max(0, fightsHad - wins - losses);

    // Низ обмежено 19, щоб діапазон ніколи не схлопувався в точку:
    // стеля-число суперечить DOMAIN_MODEL і перетворює скаутинг на пошук цифри.
    const potentialLow = Math.min(19, tier.centre + rng.int(0, 4));
    const roundsBoxed = fightsHad * rng.int(3, 9);

    fighters.push({
      id: `f-${(seed >>> 0).toString(36)}-${i.toString(36)}`,
      name: generateName(rng, region),
      countryCode: region,
      age,
      constants: {
        heightCm,
        reachCm,
        stance,
        naturalWeightClassId: weightClassById(weightClass.id).id,
      },
      attributes,
      condition: {
        sharpness: rng.int(45, 100),
        freshness: rng.int(55, 100),
        weightKg: weightClass.limitKg === 0 ? rng.int(91, 118) : Math.round(weightClass.limitKg + rng.next() * 4),
      },
      wear: {
        headTrauma: Math.min(100, Math.round(roundsBoxed * 0.18 + rng.int(0, 8))),
        bodyWear: Math.min(100, Math.round(roundsBoxed * 0.12 + rng.int(0, 6))),
        roundsBoxed,
      },
      record: { wins, losses, draws, knockouts: Math.round(wins * rng.next() * 0.7) },
      style,
      potentialRange: [potentialLow, Math.min(20, potentialLow + rng.int(1, 3))] as const,
    });
  }

  return { seed, fighters };
}
