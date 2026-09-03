import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const aliases = [{ find: '@/', replacement: `${rootDir}/` }];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: aliases,
  },
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 68,
        functions: 78,
        lines: 82,
      },
    },
    projects: [
      {
        test: {
          name: 'unit-node',
          environment: 'node',
          alias: aliases,
          include: [
            'lib/**/*.test.ts',
            'next-config.test.ts',
            'test/fixture-production-proxy.test.ts',
            'test/playwright-config.test.ts',
          ],
          exclude: [
            'lib/analytics.test.ts',
            'lib/assistant-attribution.test.ts',
            'lib/haptics.test.ts',
            'lib/instrumentation-client.test.ts',
            'lib/marketing-attribution.test.ts',
            'lib/marketing-destinations.test.ts',
            'lib/mobile-page-zoom.test.ts',
            '**/*.integration.test.ts',
            '**/node_modules/**',
            '**/.next/**',
            '**/dist/**',
          ],
        },
      },
      {
        test: {
          name: 'browser-unit-jsdom',
          environment: 'jsdom',
          alias: aliases,
          setupFiles: ['./test/setup/component.ts'],
          include: [
            'lib/analytics.test.ts',
            'lib/assistant-attribution.test.ts',
            'lib/haptics.test.ts',
            'lib/instrumentation-client.test.ts',
            'lib/marketing-attribution.test.ts',
            'lib/marketing-destinations.test.ts',
            'lib/mobile-page-zoom.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'component-jsdom',
          environment: 'jsdom',
          alias: aliases,
          setupFiles: ['./test/setup/component.ts'],
          include: ['components/**/*.test.ts', 'components/**/*.test.tsx'],
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
          name: 'app-contract-node',
          environment: 'node',
          alias: aliases,
          include: ['app/**/*.integration.test.ts', 'app/**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'component-integration-jsdom',
          environment: 'jsdom',
          alias: aliases,
          setupFiles: ['./test/setup/component.ts'],
          include: ['components/**/*.integration.test.ts', 'components/**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
    ],
  },
});
