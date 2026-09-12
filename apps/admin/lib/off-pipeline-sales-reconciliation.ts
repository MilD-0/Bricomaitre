import { and, eq, inArray, sql } from 'drizzle-orm';

import { actionLogs, offPipelineSales, processedOrders } from '@bric/db/schema';
import type { Transaction } from './action-history';

export async function reconcileLegacySales(tx: Transaction, trackings?: string[]) {
  if (trackings?.length === 0) return;
  const removed = await tx
    .delete(offPipelineSales)
    .where(
      and(
        trackings ? inArray(offPipelineSales.legacyTracking, trackings) : undefined,
        sql`exists (
        select 1 from ${processedOrders}
        where ${processedOrders.tracking} = ${offPipelineSales.legacyTracking}
          and ${processedOrders.importBatchId} <> 'MANUAL'
      )`,
      ),
    )
    .returning({ id: offPipelineSales.id });
  if (!removed.length) return;
  // Historical undo/redo must not restore money now represented by a settlement.
  await tx
    .update(actionLogs)
    .set({ isReversible: false })
    .where(
      and(
        eq(actionLogs.entityType, 'offPipelineSales'),
        inArray(
          actionLogs.entityId,
          removed.map((row) => row.id),
        ),
      ),
    );
}
