import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Alias each workspace package to its TS source so tests run against source. */
const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: { reporter: ['text', 'html'] },
  },
  resolve: {
    alias: {
      '@cs2coach/shared': fromRoot('packages/shared/src/index.ts'),
      '@cs2coach/database': fromRoot('packages/database/src/index.ts'),
      '@cs2coach/faceit': fromRoot('packages/faceit/src/index.ts'),
      '@cs2coach/game-state': fromRoot('packages/game-state/src/index.ts'),
      '@cs2coach/tactical-engine': fromRoot('packages/tactical-engine/src/index.ts'),
      '@cs2coach/ai': fromRoot('packages/ai/src/index.ts'),
    },
  },
});