import { and, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { actionLogs, offPipelineSales, processedOrders } from '@bric/db/schema';
import { dayInTimezone } from './analytics/date-range';
import { ANALYTICS_TIMEZONE } from './profit-tracker/contract';

type Database = ReturnType<typeof getDb>;

export async function backfillLegacyManualOrders(db: Database) {
  return db.transaction(async (tx) => {
    const disabledActions = await tx
      .update(actionLogs)
      .set({ isReversible: false })
      .where(and(eq(actionLogs.entityType, 'statsManualOrders'), eq(actionLogs.isReversible, true)))
      .returning({ id: actionLogs.id });
    const rows = await tx
      .select()
      .from(processedOrders)
      .where(eq(processedOrders.importBatchId, 'MANUAL'));
    if (rows.length === 0) {
      return { scanned: 0, migrated: 0, disabledActions: disabledActions.length };
    }

    await tx.insert(offPipelineSales).values(
      rows.map((row) => ({
        reference: `legacy-manual:${row.tracking}`,
        description: 'Legacy off-pipeline sale',
        recognizedOn: dayInTimezone(
          row.encaissedAt ?? row.deliveredAt ?? row.orderCreatedAt ?? row.createdAt,
          ANALYTICS_TIMEZONE,
        ),
        amountCollected: row.amountCollected,
        fees: row.totalFees,
        productCost: row.productCost,
        note: `Migrated from retired manual record ${row.orderId}.`,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
    await tx.delete(processedOrders).where(eq(processedOrders.importBatchId, 'MANUAL'));
    return {
      scanned: rows.length,
      migrated: rows.length,
      disabledActions: disabledActions.length,
    };
  });
}
