import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 84,
        branches: 78,
        functions: 90,
        lines: 85,
      },
    },
    projects: [
      {
        test: {
          name: 'unit-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
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
          name: 'route-contract-node',
          environment: 'node',
          setupFiles: ['./test/setup/node.ts'],
          include: ['**/*.integration.test.ts', '**/*.integration.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
    ],
  },
});
