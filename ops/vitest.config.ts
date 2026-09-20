import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ops-contract-node',
    environment: 'node',
    testTimeout: 15_000,
    include: ['tests/**/*.test.ts'],
  },
});
