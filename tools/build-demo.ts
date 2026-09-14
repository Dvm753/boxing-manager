/**
 * Збирає демонстраційну сторінку в один самодостатній HTML-файл.
 * Вимоги — `governance/DEMO_BUILD_PROTOCOL.md`: відкривається з file://, без мережі, без сервера.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const STAGE = process.env.STAGE ?? '0.1';
const OUT_DIR = 'dist-demo';

const bundled = await build({
  entryPoints: ['tools/demo-entry.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  minify: false,
  logLevel: 'warning',
});

const js = bundled.outputFiles[0]!.text;
const date = new Date().toISOString().slice(0, 10);
let commit = 'без git';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* поза репозиторієм */ }

const html = readFileSync('tools/demo-page.html', 'utf8')
  .replace(/__STAGE__/g, STAGE)
  .replace(/__DATE__/g, date)
  .replace(/__COMMIT__/g, commit)
  .replace('__BUNDLE__', () => js);

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `boxing-manager-demo-${STAGE}-${date}.html`);
writeFileSync(file, html, 'utf8');

const kb = (html.length / 1024).toFixed(0);
console.log(`✓ ${file}  (${kb} КБ, самодостатній)`);
if (/https?:\/\/[^"'\s]+/.test(html.replace(/https?:\/\/(www\.)?w3\.org[^"'\s]*/g, ''))) {
  console.warn('⚠ у сторінці знайдено зовнішнє посилання — перевірте вимогу «без мережі»');
}
