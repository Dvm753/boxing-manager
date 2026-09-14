import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@bm/core-model': resolve(__dirname, 'packages/core-model/src/index.ts'),
      '@bm/data': resolve(__dirname, 'packages/data/src/index.ts'),
      '@bm/engine-fight': resolve(__dirname, 'packages/engine-fight/src/index.ts'),
      '@bm/sim-cli': resolve(__dirname, 'packages/sim-cli/src/index.ts'),
    },
  },
  test: { include: ['packages/**/test/**/*.test.ts'] },
});
