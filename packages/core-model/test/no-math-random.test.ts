import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AGENTS.md §3: `Math.random()` заборонений у пакетах рушіїв.
 * Тест замінює лінт-правило, доки лінт не налаштований, — і лишиться після нього
 * як другий рубіж: правило легко вимкнути коментарем, тест — ні.
 */
const GUARDED = ['core-model', 'data', 'ai', 'engine-fight', 'engine-world'];

function sourceFiles(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Згадка в коментарі-поясненні дозволена — забороняється саме виклик у коді. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('чистота рушіїв', () => {
  it('жоден охоронюваний пакет не викликає Math.random()', () => {
    const offenders: string[] = [];
    for (const pkg of GUARDED) {
      const dir = join(process.cwd(), 'packages', pkg, 'src');
      let files: string[];
      try { files = sourceFiles(dir); } catch { continue; }
      for (const file of files) {
        const code = stripComments(readFileSync(file, 'utf8'));
        if (/Math\s*\.\s*random\s*\(/.test(code)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
