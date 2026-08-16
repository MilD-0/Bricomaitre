import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ops-contract-node',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
