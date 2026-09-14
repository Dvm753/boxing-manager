import type { Rng, StyleAxes } from '@bm/core-model';
import { STYLE_AXES } from '@bm/core-model';

/**
 * Профілі, з яких генеруються осі стилю. Це не архетипи в коді рушія (ADR-0011 забороняє),
 * а лише спосіб зробити світ різноманітним: осі розкидаються навколо профілю,
 * і два бійці одного профілю виходять помітно різними.
 */
const PROFILES: readonly Partial<StyleAxes>[] = [
  { preferredRange: 5,  pressure: 6,  punchVolume: 13, risk: 6,  counterTendency: 9,  bodyAttack: 8 },
  { preferredRange: 11, pressure: 11, punchVolume: 12, risk: 11, counterTendency: 10, bodyAttack: 11 },
  { preferredRange: 16, pressure: 17, punchVolume: 16, risk: 13, counterTendency: 7,  bodyAttack: 15 },
  { preferredRange: 12, pressure: 13, punchVolume: 8,  risk: 17, counterTendency: 8,  bodyAttack: 9 },
  { preferredRange: 8,  pressure: 7,  punchVolume: 9,  risk: 6,  counterTendency: 17, bodyAttack: 9 },
  { preferredRange: 15, pressure: 8,  punchVolume: 8,  risk: 7,  counterTendency: 12, bodyAttack: 7 },
  { preferredRange: 13, pressure: 14, punchVolume: 11, risk: 10, counterTendency: 9,  bodyAttack: 16 },
];

export function generateStyleAxes(rng: Rng): StyleAxes {
  const profile = rng.pick(PROFILES);
  const axes = {} as StyleAxes;
  for (const axis of STYLE_AXES) {
    const centre = profile[axis] ?? 10;
    axes[axis] = Math.max(1, Math.min(20, centre + rng.normalInt(-3, 3)));
  }
  return axes;
}
