import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: 'drizzle-orm', replacement: `${rootDir}/node_modules/drizzle-orm` },
      { find: 'drizzle-orm/', replacement: `${rootDir}/node_modules/drizzle-orm/` },
      { find: 'zod', replacement: `${rootDir}/node_modules/zod` },
      { find: 'pg', replacement: `${rootDir}/node_modules/pg` },
      { find: 'next', replacement: `${rootDir}/node_modules/next` },
      { find: 'next/', replacement: `${rootDir}/node_modules/next/` },
      { find: '@bric/db', replacement: `${rootDir}/../../packages/db/src/index.ts` },
      { find: /^@bric\/db\/(.*)$/, replacement: `${rootDir}/../../packages/db/src/$1` },
      {
        find: '@bric/storefront-core/meta-contracts',
        replacement: `${rootDir}/../../packages/storefront-core/src/storefront/meta-contracts.ts`,
      },
      {
        find: '@bric/storefront-core/meta',
        replacement: `${rootDir}/../../packages/storefront-core/src/storefront/meta.ts`,
      },
      {
        find: '@bric/storefront-core',
        replacement: `${rootDir}/../../packages/storefront-core/src/index.ts`,
      },
      {
        find: /^@bric\/storefront-core\/(.*)$/,
        replacement: `${rootDir}/../../packages/storefront-core/src/$1`,
      },
      { find: '@/', replacement: `${rootDir}/` },
    ],
  },
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
        test: {
          name: 'unit-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.test.ts'],
          exclude: [
            'test/services.test.ts',
            '**/*.integration.test.ts',
            '**/*.integration.test.tsx',
            '**/*.redis.test.ts',
            'store/app-store.test.ts',
            '**/node_modules/**',
            '**/.next/**',
            '**/dist/**',
          ],
        },
      },
      {
        test: {
          name: 'component-jsdom',
          environment: 'jsdom',
          setupFiles: ['./test/setup/component.ts'],
          include: ['**/*.test.tsx', 'store/app-store.test.ts'],
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
        test: {
          name: 'route-contract-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.integration.test.ts', '**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'redis-integration-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.redis.test.ts'],
        },
      },
      {
        test: {
          name: 'service-integration-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['test/services.test.ts'],
        },
      },
    ],
  },
});
