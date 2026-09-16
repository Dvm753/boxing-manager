import { normalize, type Rng, type StyleAxes } from '@bm/core-model';
import { scoreRound, resolveDecision, type RoundPerception } from './judging.js';
import { TUNING } from './tuning.js';
import type {
  FightContext, FightEvent, FightOutcome, FightPlan, FightResult, FightStats,
  FighterSide, FighterSnapshot, LandQuality, Position, PunchType,
} from './types.js';

const emptyStats = (): FightStats => ({
  thrown: 0, landed: 0, jabsThrown: 0, jabsLanded: 0, powerThrown: 0, powerLanded: 0, knockdowns: 0,
});

interface FighterState {
  side: FighterSide;
  snap: FighterSnapshot;
  axes: StyleAxes;
  /**
   * «Вечір» бійця: розіграний один раз на бій множник результативності.
   * Без нього раунди незалежні, і в рівному бою картка 6–6 випадає за чистою
   * комбінаторикою значно частіше, ніж у реальному боксі.
   */
  form: number;
  headDamage: number;
  bodyDamage: number;
  stamina: number;
  knockdownsThisRound: number;
  knockdownsTotal: number;
  stunned: number;
  cuts: number;
  stats: FightStats;
}

/** Осі бійця, перекриті планом на цей раунд (ADR-0014). */
function axesForRound(base: StyleAxes, plan: FightPlan, round: number): StyleAxes {
  const axes = { ...base, ...plan.baseAxes };
  for (const block of plan.blocks) {
    if (round >= block.fromRound && round <= block.toRound) Object.assign(axes, block.axisAdjustments);
  }
  return axes;
}

const a01 = (v: number): number => normalize(v);

function chooseAction(f: FighterState, position: Position, rng: Rng): PunchType {
  const { punchVolume, bodyAttack, risk, preferredRange } = f.axes;
  const wantBody = a01(bodyAttack) * 0.55;
  const wantPower = a01(risk) * 0.5 + a01(preferredRange) * 0.2;
  const roll = rng.next();

  if (roll < wantBody * 0.45) return 'bodyShot';
  if (position === 'inside' || position === 'clinch') {
    return rng.next() < 0.55 ? 'uppercut' : 'hook';
  }
  if (roll < 0.30 + (1 - a01(punchVolume)) * 0.18 - wantPower * 0.2) return 'jab';
  return rng.next() < 0.5 ? 'cross' : 'hook';
}

function resolveQuality(
  attacker: FighterState, defender: FighterState, punch: PunchType, position: Position, rng: Rng,
): LandQuality {
  const atk = attacker.snap.attributes;
  const def = defender.snap.attributes;

  const offence =
    a01(atk[punch === 'bodyShot' ? 'bodyPunching' : punch]) * 0.45 +
    a01(atk.accuracy) * 0.28 +
    a01(atk.timing) * 0.17 +
    a01(atk.handSpeed) * 0.10;

  const defence =
    a01(def.headMovement) * 0.28 +
    a01(def.blocking) * 0.24 +
    a01(def.defensiveDiscipline) * 0.18 +
    a01(def.anticipation) * 0.16 +
    a01(def.footwork) * 0.14;

  const attackerFatigue = (attacker.stamina / 100) * attacker.form;
  const defenderFatigue = defender.stamina / 100;
  const reachEdge = (attacker.snap.reachCm - defender.snap.reachCm) / 100;
  const positionBonus = position === 'ropes' || position === 'inside' ? 0.06 : 0;
  const stunBonus = defender.stunned > 0 ? 0.22 : 0;

  const chance =
    TUNING.baseLandChance[punch]
    * (0.55 + offence * 0.95 * attacker.form)
    / (0.62 + defence * 0.85 * defender.form * (0.55 + defenderFatigue * 0.45))
    * (0.72 + attackerFatigue * 0.28)
    + positionBonus + stunBonus + reachEdge * 0.05;

  const roll = rng.next();
  if (roll > chance) {
    // Не влучив: або промах, або прийнято на захист.
    return rng.next() < 0.58 + a01(def.blocking) * 0.2 ? 'block' : 'miss';
  }

  // Влучив — наскільки чисто. Сила і стан жертви зсувають розподіл угору.
  const power = a01(atk.punchPower) * 0.55 + a01(atk.strength) * 0.2 + a01(atk.timing) * 0.25;
  const resist = punch === 'bodyShot' ? a01(def.bodyResistance) : a01(def.chin);
  const severity = rng.next() * (0.45 + power * 0.75) * (1.25 - resist * 0.45)
    * (defender.stunned > 0 ? 1.35 : 1)
    * (0.85 + (1 - defenderFatigue) * 0.3);

  if (severity > 0.92) return 'critical';
  if (severity > 0.66) return 'heavy';
  if (severity > 0.40) return 'clean';
  if (severity > 0.22) return 'glancing';
  return 'partial';
}

function nextPosition(a: FighterState, b: FighterState, current: Position, rng: Rng): Position {
  const pressure = (a01(a.axes.pressure) + a01(b.axes.pressure)) / 2;
  const inward = a01(a.axes.preferredRange) * 0.5 + a01(b.axes.preferredRange) * 0.5;
  const roll = rng.next();
  const toInside = 0.22 + pressure * 0.3 + inward * 0.2;

  switch (current) {
    case 'out-of-range': return roll < 0.7 ? 'long' : 'out-of-range';
    case 'long': return roll < toInside ? 'mid' : roll < 0.9 ? 'long' : 'out-of-range';
    case 'mid': return roll < toInside * 0.7 ? 'inside' : roll < 0.75 ? 'mid' : 'long';
    case 'inside': return roll < 0.18 ? 'clinch' : roll < 0.3 ? 'ropes' : roll < 0.75 ? 'inside' : 'mid';
    case 'clinch': return roll < 0.75 ? 'mid' : 'inside';
    case 'ropes': {
      // Вихід із канатів — окремий атрибут (ADR-0010).
      const escape = a01(b.snap.attributes.ringEscape) * 0.55 + a01(b.snap.attributes.footwork) * 0.3;
      return roll < 0.25 + escape * 0.5 ? 'mid' : 'ropes';
    }
    default: return 'mid';
  }
}

/**
 * Симуляція одного бою. Чиста функція: без I/O, годинника і глобального стану.
 * Той самий seed і ті самі входи дають байт-ідентичний лог (ADR-0003).
 */
export function simulateFight(
  a: FighterSnapshot, b: FighterSnapshot, context: FightContext, rng: Rng,
): FightOutcome {
  const events: FightEvent[] = [];
  const mk = (snap: FighterSnapshot, side: FighterSide): FighterState => ({
    side, snap, axes: snap.styleAxes,
    form: 0.90 + rng.next() * 0.18 + (snap.sharpness / 100) * 0.06
      + (1 - normalize(snap.attributes.consistency)) * (rng.next() - 0.5) * 0.14,
    headDamage: 0, bodyDamage: 0,
    stamina: 55 + snap.freshness * 0.45,
    knockdownsThisRound: 0, knockdownsTotal: 0, stunned: 0, cuts: 0, stats: emptyStats(),
  });
  const fa = mk(a, 'a');
  const fb = mk(b, 'b');
  const cards: [number, number][] = context.judges.map(() => [0, 0]);

  let finish: { winner: FighterSide; reason: 'ko' | 'tko' | 'rtd'; round: number; second: number } | null = null;

  for (let round = 1; round <= context.scheduledRounds && !finish; round++) {
    events.push({ t: 'roundStart', round });
    fa.axes = axesForRound(a.styleAxes, context.planA, round);
    fb.axes = axesForRound(b.styleAxes, context.planB, round);
    fa.knockdownsThisRound = 0;
    fb.knockdownsThisRound = 0;

    const perception: RoundPerception = {
      cleanA: 0, cleanB: 0, aggressionA: 0, aggressionB: 0,
      controlA: 0, controlB: 0, defenceA: 0, defenceB: 0, knockdownsA: 0, knockdownsB: 0,
    };
    let position: Position = 'long';

    for (let e = 0; e < TUNING.exchangesPerRound && !finish; e++) {
      // Годинник раунду (ADR-0025, Q30): номер обміну, перекладений у секунди
      // трихвилинного раунду. Не нова випадковість — рушій це й так знав.
      const second = Math.min(179, Math.floor((e / TUNING.exchangesPerRound) * 180));

      // Ініціатива: робота ніг, швидкість, агресія, ринговий IQ, мінус втома.
      const initiative = (f: FighterState): number =>
        a01(f.snap.attributes.footwork) * 0.22 + a01(f.snap.attributes.handSpeed) * 0.2 +
        a01(f.axes.pressure) * 0.26 + a01(f.snap.attributes.ringIq) * 0.16 +
        (f.stamina / 100) * 0.16 - (f.stunned > 0 ? 0.3 : 0);

      const attacker = rng.next() < initiative(fa) / (initiative(fa) + initiative(fb)) ? fa : fb;
      const defender = attacker === fa ? fb : fa;

      const vol = a01(attacker.axes.punchVolume);
      const punches = 1 + (rng.next() < 0.25 + vol * 0.55 ? 1 : 0) + (rng.next() < vol * 0.22 ? 1 : 0);
      for (let p = 0; p < punches && !finish; p++) {
        const punch = chooseAction(attacker, position, rng);
        const quality = resolveQuality(attacker, defender, punch, position, rng);
        events.push({ t: 'punch', round, second, by: attacker.side, punch, quality, position });

        const st = attacker.stats;
        st.thrown++;
        if (punch === 'jab') st.jabsThrown++; else st.powerThrown++;
        attacker.stamina = Math.max(0, attacker.stamina - TUNING.staminaPerPunch);

        const landed = quality !== 'miss' && quality !== 'block';
        if (landed) {
          st.landed++;
          if (punch === 'jab') st.jabsLanded++; else st.powerLanded++;
          if (punch === 'bodyShot') {
            defender.bodyDamage += TUNING.bodyDamage[quality];
            defender.stamina = Math.max(0, defender.stamina - TUNING.bodyDamage[quality] * 0.55);
          } else {
            defender.headDamage += TUNING.headDamage[quality];
          }
          if (attacker.side === 'a') perception.cleanA += TUNING.headDamage[quality];
          else perception.cleanB += TUNING.headDamage[quality];

          if (quality === 'heavy' || quality === 'critical') {
            defender.stunned = Math.max(defender.stunned, quality === 'critical' ? 3 : 1);
            events.push({ t: 'stun', round, second, on: defender.side });
          }
          if (quality === 'critical' && defender.cuts < 2 && rng.next() < 0.12 * (1 - a01(defender.snap.attributes.cutResistance))) {
            defender.cuts++;
            events.push({
              t: 'cut', round, second, on: defender.side,
              location: rng.pick(['left-eye', 'right-eye', 'forehead'] as const),
            });
          }

          // Нокдаун: накопичена шкода плюс окремий шанс від critical.
          const over = Math.max(0, defender.headDamage - TUNING.knockdownThreshold) / 100;
          const chinFactor = 1.3 - a01(defender.snap.attributes.chin) * 0.8;
          const kdChance =
            over * 0.42 * chinFactor
            + (quality === 'critical' ? TUNING.flashKnockdownChance * chinFactor : 0);

          if (rng.next() < kdChance) {
            defender.knockdownsThisRound++;
            defender.knockdownsTotal++;
            attacker.stats.knockdowns++;
            if (defender.side === 'a') perception.knockdownsA++; else perception.knockdownsB++;
            events.push({ t: 'knockdown', round, second, by: attacker.side, count: defender.knockdownsTotal });

            const heart = a01(defender.snap.attributes.heart);
            const wearPenalty = defender.snap.headTrauma / 300;
            const koChance = TUNING.koOnKnockdownBase + over * 0.9 + wearPenalty - heart * 0.14;
            if (rng.next() < koChance) {
              finish = { winner: attacker.side, reason: 'ko', round, second };
            } else if (context.threeKnockdownRule && defender.knockdownsThisRound >= 3) {
              finish = { winner: attacker.side, reason: 'tko', round, second };
            } else {
              defender.stunned = 4;
              defender.headDamage += 4;
            }
          }
        }

        if (attacker.side === 'a') perception.aggressionA += 1; else perception.aggressionB += 1;
      }

      if (!finish && defender.headDamage > TUNING.refereeStopThreshold && defender.stunned > 0) {
        finish = { winner: attacker.side, reason: 'tko', round, second };
      }

      position = nextPosition(attacker, defender, position, rng);
      if (position === 'ropes') {
        if (attacker.side === 'a') perception.controlA += 1.2; else perception.controlB += 1.2;
      }
      fa.stunned = Math.max(0, fa.stunned - 1);
      fb.stunned = Math.max(0, fb.stunned - 1);
    }

    if (finish) break;

    perception.defenceA = fb.stats.landed > 0 ? 100 / (fb.stats.landed + 12) : 6;
    perception.defenceB = fa.stats.landed > 0 ? 100 / (fa.stats.landed + 12) : 6;

    const card = context.judges.map((j, i) => {
      const acc = cards[i] as [number, number];
      const spread = acc[0] + acc[1] === 0 ? 0 : (acc[0] - acc[1]) / Math.max(1, round - 1);
      return scoreRound(j, perception, rng, spread);
    });
    card.forEach((c, i) => {
      const acc = cards[i] as [number, number];
      acc[0] += c[0];
      acc[1] += c[1];
    });
    // Втома і шкода наприкінці раунду — **до** відновлення в кутку нижче, бо саме
    // такими вони були, коли пролунав гонг (закриває Q31).
    events.push({
      t: 'roundEnd', round, cards: card,
      staminaA: fa.stamina, staminaB: fb.stamina,
      headDamageA: fa.headDamage, headDamageB: fb.headDamage,
      bodyDamageA: fa.bodyDamage, bodyDamageB: fb.bodyDamage,
    });

    // Відновлення між раундами.
    for (const f of [fa, fb]) {
      const rec = a01(f.snap.attributes.recovery);
      f.stamina = Math.min(100, f.stamina + TUNING.staminaRecoveryPerRound * (0.6 + rec * 0.8));
      f.headDamage = Math.max(0, f.headDamage - 2.6 * (0.5 + rec));
      f.stunned = 0;
    }

    // Кут може зняти бійця, якщо той розбитий.
    for (const [f, other] of [[fa, fb], [fb, fa]] as const) {
      if (!finish && f.headDamage > 70 && rng.next() < TUNING.cornerRetirementChance * (f.headDamage / 40)) {
        finish = { winner: other.side, reason: 'rtd', round, second: 180 };
      }
    }
  }

  let result: FightResult;
  if (finish) {
    events.push({
      t: 'stoppage', round: finish.round, second: finish.second,
      winner: finish.winner, reason: finish.reason,
    });
    result = {
      method: finish.reason === 'ko' ? 'KO' : finish.reason === 'rtd' ? 'RTD' : 'TKO',
      winner: finish.winner,
      endingRound: finish.round,
      scorecards: [],
      statsA: fa.stats, statsB: fb.stats,
    };
  } else {
    const decision = resolveDecision(cards);
    events.push({ t: 'decision', kind: decision.kind, winner: decision.winner });
    result = {
      method: decision.kind,
      winner: decision.winner,
      endingRound: context.scheduledRounds,
      scorecards: cards.map((c) => [c[0], c[1]] as const),
      statsA: fa.stats, statsB: fb.stats,
    };
  }

  return { result, eventLog: events };
}
