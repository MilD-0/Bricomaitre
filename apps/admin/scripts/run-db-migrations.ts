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
    const { migrationsFolder, commercialBackfill, phoneBackfill } = await runDbMigrations(db);
    console.log(`Applied migrations from ${migrationsFolder}`);
    console.log(
      `Order commercial snapshots: scanned=${commercialBackfill.scanned} backfilled=${commercialBackfill.backfilled} unresolved=${commercialBackfill.unresolvedOrderIds.length}`,
    );
    if (commercialBackfill.unresolvedOrderIds.length > 0) {
      const sample = commercialBackfill.unresolvedOrderIds.slice(0, 20).join(', ');
      console.warn(
        `Preserved ${commercialBackfill.unresolvedOrderIds.length} historical orders with unresolved catalog references; no products or commercial line values were guessed. Sample order IDs: ${sample}`,
      );
    }
    console.log(
      `Order phone normalization: scanned=${phoneBackfill.scanned} backfilled=${phoneBackfill.backfilled} invalid=${phoneBackfill.invalidOrderIds.length}`,
    );
    if (phoneBackfill.invalidOrderIds.length > 0) {
      const sample = phoneBackfill.invalidOrderIds.slice(0, 20).join(', ');
      console.warn(
        `Preserved ${phoneBackfill.invalidOrderIds.length} historical phone values that cannot be normalized. Sample order IDs: ${sample}`,
      );
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
