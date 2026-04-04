import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./db/schema/actionLogs.ts",
    "./db/schema/adCosts.ts",
    "./db/schema/analytics.ts",
    "./db/schema/assets.ts",
    "./db/schema/auth.ts",
    "./db/schema/brands.ts",
    "./db/schema/bulletin.ts",
    "./db/schema/categories.ts",
    "./db/schema/ecotrack.ts",
    "./db/schema/importBatches.ts",
    "./db/schema/migrationIdMap.ts",
    "./db/schema/namespaces.ts",
    "./db/schema/orders.ts",
    "./db/schema/processedOrders.ts",
    "./db/schema/products.ts",
    "./db/schema/roleDefinitions.ts",
    "./db/schema/userAccessGrants.ts",
  ],
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
