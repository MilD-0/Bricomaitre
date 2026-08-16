import { defineConfig } from 'drizzle-kit';

import { drizzleSchemaFiles } from './drizzle.schemas';

export default defineConfig({
  dialect: 'postgresql',
  schema: [...drizzleSchemaFiles],
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
