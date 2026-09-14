import { generateWorld } from '../packages/data/src/fighter-generator.js';
import { WEIGHT_CLASSES } from '../packages/data/src/weight-classes.js';
import {
  TECHNICAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES,
} from '../packages/core-model/src/attributes.js';
import { STYLE_AXES, styleLabel } from '../packages/core-model/src/style.js';

// Демо лише відображає результати пакетів. Жодних правил домену тут немає
// (ARCHITECTURE.md, інваріант 1: подання не обчислює правил).
declare global {
  interface Window { BM: unknown }
}
window.BM = {
  generateWorld,
  WEIGHT_CLASSES,
  STYLE_AXES,
  styleLabel,
  groups: {
    technical: TECHNICAL_ATTRIBUTES,
    physical: PHYSICAL_ATTRIBUTES,
    mental: MENTAL_ATTRIBUTES,
  },
};
