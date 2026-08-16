import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@bric/db/schema';
import { verifyDbMigrations } from '../lib/db-verify';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString });

  try {
    const db = drizzle(pool, { schema });
    const result = await verifyDbMigrations(db);
    const latestApplied = result.latestAppliedTag
      ? ` Latest applied: ${result.latestAppliedTag}.`
      : '';
    console.log(
      `Migration verification passed. Database has ${result.appliedCount} applied migrations and local journal has ${result.localCount}.${latestApplied}`,
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
