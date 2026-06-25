import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: /^@\//, replacement: `${rootDir}/` }
    ]
  },
  test: {
    alias: [
      { find: /^@\//, replacement: `${rootDir}/` }
    ],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./test/setup.ts"],
          include: ["lib/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**", "**/.next/**", "**/dist/**"]
        }
      },
      {
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["./test/setup.ts"],
          include: ["**/*.integration.test.ts"],
          exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"]
        }
      }
    ]
  }
});
