import { createNextEslintConfig } from '../../eslint.base.mjs';

export default createNextEslintConfig([
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]);
