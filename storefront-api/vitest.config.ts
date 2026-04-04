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
      { find: '@bric/db', replacement: `${rootDir}/../packages/db/src/index.ts` },
      { find: /^@bric\/db\/(.*)$/, replacement: `${rootDir}/../packages/db/src/$1` },
      { find: '@bric/storefront-core', replacement: `${rootDir}/../packages/storefront-core/src/index.ts` },
      { find: /^@bric\/storefront-core\/(.*)$/, replacement: `${rootDir}/../packages/storefront-core/src/$1` },
      { find: '@/', replacement: `${rootDir}/` },
    ],
  },
  test: {
    alias: [
      { find: 'drizzle-orm', replacement: `${rootDir}/node_modules/drizzle-orm` },
      { find: 'drizzle-orm/', replacement: `${rootDir}/node_modules/drizzle-orm/` },
      { find: 'zod', replacement: `${rootDir}/node_modules/zod` },
      { find: 'pg', replacement: `${rootDir}/node_modules/pg` },
      { find: 'next', replacement: `${rootDir}/node_modules/next` },
      { find: 'next/', replacement: `${rootDir}/node_modules/next/` },
      { find: '@bric/db', replacement: `${rootDir}/../packages/db/src/index.ts` },
      { find: /^@bric\/db\/(.*)$/, replacement: `${rootDir}/../packages/db/src/$1` },
      { find: '@bric/storefront-core', replacement: `${rootDir}/../packages/storefront-core/src/index.ts` },
      { find: /^@bric\/storefront-core\/(.*)$/, replacement: `${rootDir}/../packages/storefront-core/src/$1` },
      { find: '@/', replacement: `${rootDir}/` },
    ],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['**/*.test.ts', '**/*.test.tsx'],
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
          name: 'integration',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['**/*.integration.test.ts', '**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
    ],
  },
});
