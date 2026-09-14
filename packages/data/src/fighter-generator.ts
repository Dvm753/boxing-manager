import {
  ALL_ATTRIBUTES, type Attributes, type Fighter, type Rng, type Stance, type StyleAxes,
  createRng, deriveSeed,
} from '@bm/core-model';
import { generateName, listRegions } from './name-generator.js';
import { generateStyleAxes } from './style-profiles.js';
import { WEIGHT_CLASSES, weightClassById } from './weight-classes.js';

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
 * Зсуває атрибути під **осі** стилю (ADR-0011), а не під мітку: боєць, який тисне,
 * мусить мати чим тиснути. Мітка ніде не бере участі.
 */
function applyAxisBias(attributes: Attributes, axes: StyleAxes): void {
  const bump = (key: keyof Attributes, delta: number): void => {
    attributes[key] = Math.max(1, Math.min(20, Math.round(attributes[key] + delta)));
  };
  const off = (v: number): number => (v - 10) / 10; // -0.9 ... +1.0

  bump('insideFighting', off(axes.preferredRange) * 3);
  bump('distanceControl', -off(axes.preferredRange) * 3);
  bump('footwork', -off(axes.preferredRange) * 2);
  bump('aggression', off(axes.pressure) * 3);
  bump('stamina', off(axes.pressure) * 2);
  bump('workRate', off(axes.punchVolume) * 3);
  bump('combinations', off(axes.punchVolume) * 2);
  bump('punchPower', off(axes.risk) * 3);
  bump('defensiveDiscipline', -off(axes.risk) * 3);
  bump('counterPunching', off(axes.counterTendency) * 4);
  bump('timing', off(axes.counterTendency) * 3);
  bump('anticipation', off(axes.counterTendency) * 2);
  bump('composure', off(axes.counterTendency) * 2);
  bump('bodyPunching', off(axes.bodyAttack) * 4);
}

/**
 * Ваговий профіль — **неперервний за вагою**, а не три відра.
 * Відра давали немонотонність: середня вага не отримувала ні бонусу до сили важких,
 * ні бонусу до підборіддя й відновлення легких, і виявлялася найкрихкішою з трьох.
 *
 * Це фізика виду спорту, а не балансування: саме звідси береться виміряна різниця
 * у частці дострокових завершень між групами (ADR-0008).
 */
function applyWeightBias(attributes: Attributes, limitKg: number): void {
  const bump = (key: keyof Attributes, delta: number): void => {
    attributes[key] = Math.max(1, Math.min(20, Math.round(attributes[key] + delta)));
  };
  // 0 у мінімальній вазі, 1 у важкій (безлімітна рахується як 100 кг).
  const t = Math.max(0, Math.min(1, ((limitKg === 0 ? 100 : limitKg) - 47.6) / (100 - 47.6)));
  const s = t - 0.5; // -0.5 ... +0.5

  bump('punchPower', s * 1.76);
  bump('strength', s * 1.32);
  bump('chin', -s * 0.825);
  bump('recovery', -s * 0.77);
  bump('stamina', -s * 0.88);
  bump('workRate', -s * 0.77);
  bump('handSpeed', -s * 0.66);
  bump('footSpeed', -s * 0.55);
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
    const styleAxes = generateStyleAxes(rng);
    const attributes = generateAttributes(rng, tier.centre, tier.spread);
    applyAxisBias(attributes, styleAxes);

    const weightClass = rng.pick(WEIGHT_CLASSES);
    applyWeightBias(attributes, weightClass.limitKg);
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
      id: rng.uuid(),
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
      styleAxes,
      potentialRange: [potentialLow, Math.min(20, potentialLow + rng.int(1, 3))] as const,
    });
  }

  return { seed, fighters };
}
