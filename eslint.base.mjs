import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export function createNextEslintConfig(overrides = []) {
  return defineConfig([
    ...nextVitals,
    ...nextTs,
    ...overrides,
    globalIgnores([
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ]),
  ]);
}
