import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': rootDir } },
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 57,
        lines: 61,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.test.ts'],
          exclude: [
            'test/services.test.ts',
            'test/*.services.test.ts',
            '**/*.integration.test.ts',
            '**/*.integration.test.tsx',
            '**/*.redis.test.ts',
            '**/node_modules/**',
            '**/.next/**',
            '**/dist/**',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'component-jsdom',
          environment: 'jsdom',
          setupFiles: ['./test/setup/component.ts'],
          include: ['**/*.test.tsx'],
          exclude: [
            '**/*.integration.test.ts',
            '**/*.integration.test.tsx',
            '**/node_modules/**',
            '**/.next/**',
            '**/dist/**',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'route-contract-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.integration.test.ts', '**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'redis-integration-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.redis.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'service-integration-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['test/services.test.ts', 'test/*.services.test.ts'],
        },
      },
    ],
  },
});
