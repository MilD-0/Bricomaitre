import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@bric/db/schema';
import { runDbMigrations } from '../lib/db-migrate';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString });

  try {
    const db = drizzle(pool, { schema });
    const { migrationsFolder } = await runDbMigrations(db);
    console.log(`Applied migrations from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
