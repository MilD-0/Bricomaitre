import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/ai-eval-live.matrix.ts'],
    testTimeout: 600_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    setupFiles: ['./test/setup/node.ts'],
  },
});
