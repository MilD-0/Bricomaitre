import process from 'node:process';
import { sql } from 'drizzle-orm';

import { getDb, hasDb } from '../db/client';

async function main() {
  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const db = getDb();

  const [ordersResult, historyResult] = await db.transaction(async (tx) => {
    const ordersResult = await tx.execute(sql`
      UPDATE orders
      SET no_answer_count = CASE
        WHEN confirmed::text = '1' THEN GREATEST(COALESCE(no_answer_count, 0), 1)
        ELSE 0
      END
      WHERE (confirmed::text = '1' AND COALESCE(no_answer_count, 0) < 1)
         OR (confirmed::text <> '1' AND COALESCE(no_answer_count, 0) <> 0)
      RETURNING id
    `);

    const historyResult = await tx.execute(sql`
      UPDATE order_status_history
      SET no_answer_count = CASE
        WHEN status::text = '1' THEN GREATEST(COALESCE(no_answer_count, 0), 1)
        ELSE 0
      END
      WHERE (status::text = '1' AND COALESCE(no_answer_count, 0) < 1)
         OR (status::text <> '1' AND COALESCE(no_answer_count, 0) <> 0)
      RETURNING id
    `);

    return [ordersResult, historyResult];
  });

  console.log(`Normalized orders rows: ${ordersResult.rowCount ?? 0}`);
  console.log(`Normalized order history rows: ${historyResult.rowCount ?? 0}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
