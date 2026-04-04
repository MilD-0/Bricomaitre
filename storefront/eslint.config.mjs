import { createNextEslintConfig } from "../eslint.base.mjs";

export default createNextEslintConfig([
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
