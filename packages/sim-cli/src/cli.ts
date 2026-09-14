/**
 * Командний рядок для масових прогонів. Єдиний пакет, якому дозволено писати в консоль:
 * рушії лишаються чистими (`AGENTS.md` §3).
 *
 *   npm run sim -- calibrate [боїв]      гейт фази 0: M1, M3, M4 проти коридорів ADR-0008
 *   npm run sim -- season [днів] [бійців] прогін світу
 *   npm run sim -- tiers [боїв]          звірка рівнів 1/2/3 (інваріант ADR-0015)
 */
import { runCalibration } from './calibrate.js';
import { buildWorld, runSeason } from './season.js';
import { formatIso } from '@bm/engine-world';

const CORRIDORS: Record<string, readonly [number, number]> = {
  light: [40, 55], middle: [42, 58], heavy: [48, 65],
};
const DRAW: readonly [number, number] = [2.0, 4.0];
const SPLIT: readonly [number, number] = [22, 31];

const inside = (v: number, [lo, hi]: readonly [number, number]): string =>
  v >= lo && v <= hi ? '✓' : '✗';

function calibrate(fights: number): number {
  const rows = runCalibration(2026, fights);
  console.log(`\nГейт фази 0 — ${fights} боїв на групу (ADR-0008, ADR-0009)\n`);
  console.log('група    M1 дострокові      M3 нічиї         M4 роздільні');
  let ok = true;
  for (const r of rows) {
    const c = CORRIDORS[r.group] as readonly [number, number];
    const marks = [inside(r.earlyPct, c), inside(r.drawPct, DRAW), inside(r.splitPct, SPLIT)];
    if (marks.includes('✗')) ok = false;
    console.log(
      `${r.group.padEnd(8)} ${r.earlyPct.toFixed(1).padStart(5)}% ±${r.earlyCi.toFixed(1)} ${marks[0]}` +
      `   ${r.drawPct.toFixed(2).padStart(5)}% ±${r.drawCi.toFixed(2)} ${marks[1]}` +
      `   ${r.splitPct.toFixed(1).padStart(5)}% ±${r.splitCi.toFixed(1)} ${marks[2]}`,
    );
  }
  const light = rows.find((r) => r.group === 'light');
  const heavy = rows.find((r) => r.group === 'heavy');
  const separated = !!light && !!heavy && heavy.earlyPct - heavy.earlyCi > light.earlyPct + light.earlyCi;
  if (!separated) ok = false;
  console.log(`\nважка > легка з розділеними інтервалами: ${separated ? '✓' : '✗'}`);
  console.log(ok ? '\nГЕЙТ ПРОЙДЕНО' : '\nГЕЙТ НЕ ПРОЙДЕНО');
  return ok ? 0 : 1;
}

function season(days: number, fighters: number): number {
  const start = buildWorld(2026, fighters);
  const began = Date.now();
  const { world, fightsHeld, byTier } = runSeason(start, days);
  console.log(`\n${formatIso(start.day)} → ${formatIso(world.day)}  (${days} днів, ${fighters} бійців)`);
  console.log(`боїв проведено: ${fightsHeld}   за рівнями 1/2/3: ${byTier[1]}/${byTier[2]}/${byTier[3]}`);
  console.log(`травмованих зараз: ${Object.values(world.unavailableUntil).filter((d) => d > world.day).length}`);
  console.log(`час прогону: ${((Date.now() - began) / 1000).toFixed(1)} с`);
  console.log('\nостанні новини:');
  for (const item of world.news.slice(-5)) {
    console.log(`  ${formatIso(item.day)}  ${item.key}  ${JSON.stringify(item.params)}`);
  }
  return 0;
}

const [command, ...rest] = process.argv.slice(2);
const num = (i: number, fallback: number): number => Number(rest[i] ?? fallback) || fallback;

switch (command) {
  case 'calibrate': process.exitCode = calibrate(num(0, 2500)); break;
  case 'season': process.exitCode = season(num(0, 365), num(1, 2000)); break;
  default:
    console.log('Команди: calibrate [боїв] | season [днів] [бійців]');
    process.exitCode = 1;
}
