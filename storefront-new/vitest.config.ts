import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: "@/", replacement: `${rootDir}/` }
    ]
  },
  test: {
    alias: [
      { find: "@/", replacement: `${rootDir}/` }
    ],
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          alias: [
            { find: "@/", replacement: `${rootDir}/` }
          ],
          include: ["lib/**/*.test.ts", "components/**/*.test.ts", "components/**/*.test.tsx", "next-config.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**", "**/.next/**", "**/dist/**"]
        }
      },
      {
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["./test/setup.ts"],
          alias: [
            { find: "@/", replacement: `${rootDir}/` }
          ],
          include: ["**/*.integration.test.ts", "**/*.integration.test.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"]
        }
      }
    ]
  }
});
