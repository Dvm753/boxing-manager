import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@bm/core-model': resolve(__dirname, 'packages/core-model/src/index.ts'),
      '@bm/data': resolve(__dirname, 'packages/data/src/index.ts'),
      '@bm/engine-fight': resolve(__dirname, 'packages/engine-fight/src/index.ts'),
      '@bm/sim-cli': resolve(__dirname, 'packages/sim-cli/src/index.ts'),
      '@bm/i18n': resolve(__dirname, 'packages/i18n/src/index.ts'),
      '@bm/engine-world': resolve(__dirname, 'packages/engine-world/src/index.ts'),
      '@bm/ai': resolve(__dirname, 'packages/ai/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // Точка входу командного рядка — оболонка вводу-виводу; уся логіка
      // живе в `calibrate.ts` і `season.ts`, які покриті тестами.
      exclude: ['packages/*/src/**/*.json', 'packages/sim-cli/src/cli.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 85, branches: 85, functions: 90 },
    },
  },
});
