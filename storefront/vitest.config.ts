import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
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
