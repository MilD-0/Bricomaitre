import { actionLogs, orders, products } from '@bric/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ActionHistoryConflictError } from '../action-history-state';
import {
  assertNoUnresolvedEcotrackMutation,
  EcotrackMutationConflictError,
} from '../ecotrack-mutations';
import {
  lockStockAllocationHistory,
  parseStockAllocationChange,
  restoreStockAllocationHistory,
  StockAllocationHistoryConflictError,
} from '../stock-allocation-history';
import {
  assertTaxonomyRelationsUnchanged,
  isTaxonomyEntity,
  lockTaxonomyHistory,
  readTaxonomyRelations,
  restoreTaxonomyRelations,
  TaxonomyHistoryConflictError,
} from '../taxonomy-history';
import {
  type ActionActor,
  type ActionHistoryRecovery,
  type ActionLogEntry,
  type Database,
  type SnapshotRecord,
} from './contract';
import { getActionEntityConfig } from './entities';
import { deleteEntity, insertEntity, updateEntity } from './entity-store';
import { isRecord } from './snapshots';

export function resolveActionHistoryRecovery(
  entry: Pick<ActionLogEntry, 'id' | 'isReversible' | 'isUndone'>,
  entityHistory: Array<Pick<ActionLogEntry, 'id' | 'isUndone'> & { isReversible?: boolean }>,
): ActionHistoryRecovery {
  if (!entry.isReversible) {
    return { nextAction: null, blockedReason: 'non_reversible' };
  }

  entityHistory = entityHistory.filter((item) => !item.isUndone || item.isReversible !== false);
  const lastAppliedIndex = entityHistory.findLastIndex((item) => !item.isUndone);
  const supersededIds = new Set(
    entityHistory
      .slice(0, Math.max(0, lastAppliedIndex))
      .filter((item) => item.isUndone)
      .map((item) => item.id),
  );
  if (supersededIds.has(entry.id)) return { nextAction: null, blockedReason: 'non_reversible' };
  entityHistory = entityHistory.filter((item) => !supersededIds.has(item.id));
  const entryIndex = entityHistory.findIndex((historyEntry) => historyEntry.id === entry.id);
  if (entryIndex === -1 || entityHistory[entryIndex]?.isUndone !== entry.isUndone) {
    return { nextAction: null, blockedReason: 'history_out_of_sync' };
  }

  const firstUndoneIndex = entityHistory.findIndex((historyEntry) => historyEntry.isUndone);
  if (
    firstUndoneIndex >= 0 &&
    entityHistory.slice(firstUndoneIndex).some((historyEntry) => !historyEntry.isUndone)
  ) {
    return { nextAction: null, blockedReason: 'history_out_of_sync' };
  }

  const latestAppliedEntry =
    firstUndoneIndex === -1 ? entityHistory.at(-1) : entityHistory[firstUndoneIndex - 1];
  const nextRedoEntry = firstUndoneIndex === -1 ? null : entityHistory[firstUndoneIndex];

  if (!entry.isUndone) {
    return latestAppliedEntry?.id === entry.id
      ? { nextAction: 'undo', blockedReason: null }
      : { nextAction: null, blockedReason: 'newer_action' };
  }

  return nextRedoEntry?.id === entry.id
    ? { nextAction: 'redo', blockedReason: null }
    : { nextAction: null, blockedReason: 'redo_order' };
}

function assertHistoryDirection(entry: ActionLogEntry, direction: 'undo' | 'redo') {
  if (direction === 'undo' && entry.isUndone) {
    throw new ActionHistoryConflictError('Action already undone');
  }

  if (direction === 'redo' && !entry.isUndone) {
    throw new ActionHistoryConflictError('Action has not been undone');
  }

  if (!entry.isReversible) {
    throw new ActionHistoryConflictError(
      direction === 'undo' ? 'This action cannot be undone.' : 'This action cannot be redone.',
    );
  }
}

export async function applyHistoryAction(
  db: Database,
  params: {
    actionLogId: number;
    direction: 'undo' | 'redo';
    actor?: ActionActor;
  },
) {
  return db
    .transaction(async (tx) => {
      let [entry] = await tx
        .select()
        .from(actionLogs)
        .where(eq(actionLogs.id, params.actionLogId))
        .limit(1);

      if (!entry) {
        throw new ActionHistoryConflictError('Action log not found');
      }

      assertHistoryDirection(entry, params.direction);

      const config = getActionEntityConfig(entry.entityType);

      if (!config) {
        throw new ActionHistoryConflictError(`Unsupported entity type: ${entry.entityType}`);
      }

      if (isTaxonomyEntity(entry.entityType)) {
        await lockTaxonomyHistory(tx, entry.entityType, entry.entityId);
      }

      const stockAllocations =
        entry.entityType === 'products'
          ? parseStockAllocationChange(
              isRecord(entry.beforeState) ? entry.beforeState.stockAllocations : undefined,
              isRecord(entry.afterState) ? entry.afterState.stockAllocations : undefined,
              entry.entityId,
            )
          : null;
      if (
        entry.entityType === 'products' &&
        entry.operation === 'update' &&
        !stockAllocations &&
        isRecord(entry.beforeState) &&
        isRecord(entry.afterState) &&
        entry.beforeState.inventoryQuantity !== entry.afterState.inventoryQuantity &&
        (entry.beforeState.stockHistoryVersion !== 1 || entry.afterState.stockHistoryVersion !== 1)
      ) {
        throw new ActionHistoryConflictError(
          'This older stock action has no order-allocation history and cannot be safely recovered.',
        );
      }
      if (stockAllocations) {
        if (entry.operation !== 'update') {
          throw new StockAllocationHistoryConflictError(
            'Stock allocation history must update a product.',
          );
        }
        await lockStockAllocationHistory(tx, entry.entityId, stockAllocations.before);
      } else if (entry.entityType === 'products') {
        // Read the recovery sequence only after concurrent stock mutations finish.
        await tx.execute(sql`select ${products.id} from ${products}
        where ${products.id} = ${entry.entityId} for update`);
      }

      if (config.table && entry.entityType !== 'products' && !isTaxonomyEntity(entry.entityType)) {
        await tx.execute(
          sql`select ${config.table.id} from ${config.table} where ${config.table.id} = ${entry.entityId} for update`,
        );
      }

      // Ordinary mutations lock the entity before retiring redo entries. Match
      // that order, then reread the log because a waiting edit may supersede it.
      const [lockedEntry] = await tx
        .select()
        .from(actionLogs)
        .where(eq(actionLogs.id, params.actionLogId))
        .for('update')
        .limit(1);
      if (
        !lockedEntry ||
        lockedEntry.entityType !== entry.entityType ||
        lockedEntry.entityId !== entry.entityId
      ) {
        throw new ActionHistoryConflictError('Action log changed during recovery');
      }
      entry = lockedEntry;
      assertHistoryDirection(entry, params.direction);

      const entityHistory = await tx
        .select({
          id: actionLogs.id,
          isUndone: actionLogs.isUndone,
          isReversible: actionLogs.isReversible,
        })
        .from(actionLogs)
        .where(
          and(eq(actionLogs.entityType, entry.entityType), eq(actionLogs.entityId, entry.entityId)),
        )
        .orderBy(asc(actionLogs.createdAt), asc(actionLogs.id));

      if (!entityHistory.some((historyEntry) => historyEntry.id === entry.id)) {
        throw new ActionHistoryConflictError('Action log history is unavailable');
      }

      const latestAppliedIndex = entityHistory.findLastIndex((item) => !item.isUndone);
      const abandoned = entityHistory
        .slice(0, Math.max(0, latestAppliedIndex))
        .filter((item) => item.isUndone && item.isReversible)
        .map((item) => item.id);
      if (abandoned.length)
        await tx
          .update(actionLogs)
          .set({ isReversible: false })
          .where(inArray(actionLogs.id, abandoned));

      const recovery = resolveActionHistoryRecovery(entry, entityHistory);
      if (recovery.nextAction !== params.direction) {
        const message =
          recovery.blockedReason === 'history_out_of_sync'
            ? 'Action history is out of sync'
            : params.direction === 'undo'
              ? 'Only the latest applied action can be undone'
              : 'Only the next undone action can be redone';
        throw new ActionHistoryConflictError(message);
      }

      if (entry.entityType === 'orders') {
        await assertNoUnresolvedEcotrackMutation(tx, entry.entityId);
        const [live] = await tx.select().from(orders).where(eq(orders.id, entry.entityId)).limit(1);
        if (live?.ecotrackTrackingNumber || live?.ecotrackReference) {
          throw new ActionHistoryConflictError(
            'Use the carrier workflow to recover an order with an active shipment.',
          );
        }
      }

      const beforeState = entry.beforeState as SnapshotRecord | null;
      const afterState = entry.afterState as SnapshotRecord | null;

      if (params.direction === 'undo') {
        if (entry.operation === 'create') {
          if (isTaxonomyEntity(entry.entityType)) {
            const relations = await readTaxonomyRelations(tx, entry.entityType, entry.entityId);
            if (relations.productIds.length || relations.childIds.length) {
              throw new ActionHistoryConflictError(
                'This taxonomy acquired relationships after creation. Undo would remove newer work.',
              );
            }
          }
          await deleteEntity(tx, entry.entityType, entry.entityId);
        }
        if (entry.operation === 'update' && beforeState) {
          await updateEntity(
            tx,
            entry.entityType,
            entry.entityId,
            beforeState,
            afterState ?? undefined,
          );
        }
        if (entry.operation === 'delete' && beforeState) {
          await insertEntity(tx, entry.entityType, beforeState);
          if (isTaxonomyEntity(entry.entityType)) {
            await restoreTaxonomyRelations(
              tx,
              entry.entityType,
              entry.entityId,
              beforeState.taxonomyRelations,
            );
          }
        }

        if (stockAllocations) {
          await restoreStockAllocationHistory(tx, stockAllocations.after, stockAllocations.before);
        }

        await tx
          .update(actionLogs)
          .set({
            isUndone: true,
            undoneAt: new Date(),
            undoneBy: params.actor?.email ?? null,
            updatedAt: new Date(),
          })
          .where(eq(actionLogs.id, params.actionLogId));

        return { ...entry, isUndone: true };
      }

      if (entry.operation === 'create' && afterState) {
        await insertEntity(tx, entry.entityType, afterState);
      }
      if (entry.operation === 'update' && afterState) {
        await updateEntity(
          tx,
          entry.entityType,
          entry.entityId,
          afterState,
          beforeState ?? undefined,
        );
      }
      if (entry.operation === 'delete') {
        if (isTaxonomyEntity(entry.entityType)) {
          await assertTaxonomyRelationsUnchanged(
            tx,
            entry.entityType,
            entry.entityId,
            beforeState?.taxonomyRelations,
          );
        }
        await deleteEntity(tx, entry.entityType, entry.entityId);
      }

      if (stockAllocations) {
        await restoreStockAllocationHistory(tx, stockAllocations.before, stockAllocations.after);
      }

      await tx
        .update(actionLogs)
        .set({
          isUndone: false,
          redoneAt: new Date(),
          redoneBy: params.actor?.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(actionLogs.id, params.actionLogId));

      return { ...entry, isUndone: false };
    })
    .catch((error: unknown) => {
      if (
        error instanceof EcotrackMutationConflictError ||
        error instanceof StockAllocationHistoryConflictError ||
        error instanceof TaxonomyHistoryConflictError
      ) {
        throw new ActionHistoryConflictError(error.message);
      }
      throw error;
    });
}
