import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "smoke",
          environment: "node",
          fileParallelism: false,
          include: ["**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
          alias: [
            { find: "@/", replacement: `${rootDir}/` },
          ],
        },
      },
    ],
  },
});
