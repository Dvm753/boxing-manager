import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';
import { createRng, deriveSeed } from '../packages/core-model/src/rng.js';
import { simulateFight, EMPTY_PLAN } from '../packages/engine-fight/src/index.js';
import { toSnapshot, makeJudges } from '../packages/sim-cli/src/calibrate.js';
import { createTranslator, LOCALES, LOCALE_NAMES } from '../packages/i18n/src/index.js';

// Подання лише відображає результати пакетів (ARCHITECTURE.md, інваріант 1).
declare global {
  interface Window { BM: unknown }
}

function runFight(a: unknown, b: unknown, seed: number): unknown {
  const rng = createRng(deriveSeed(seed, 'demo/fight'));
  const context = {
    scheduledRounds: 12,
    judges: makeJudges(rng),
    planA: EMPTY_PLAN,
    planB: EMPTY_PLAN,
    threeKnockdownRule: false,
  };
  return simulateFight(
    toSnapshot(a as never), toSnapshot(b as never), context as never, rng,
  );
}

window.BM = {
  generateWorld, WEIGHT_CLASSES, STYLE_AXES, styleLabel, runFight,
  createTranslator, LOCALES, LOCALE_NAMES,
  groups: {
    technical: TECHNICAL_ATTRIBUTES,
    physical: PHYSICAL_ATTRIBUTES,
    mental: MENTAL_ATTRIBUTES,
  },
};
