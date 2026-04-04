import process from 'node:process';
import { sql } from 'drizzle-orm';

import { getDb, hasDb } from '../db/client';

async function main() {
  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const db = getDb();

  const result = await db.execute(sql`
    UPDATE orders
    SET delivery = CASE
      WHEN delivery::text = '1' THEN 1
      ELSE 0
    END
    WHERE delivery::text NOT IN ('0', '1')
       OR delivery IS NULL
    RETURNING id
  `);

  console.log(`Normalized delivery rows: ${result.rowCount ?? 0}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
