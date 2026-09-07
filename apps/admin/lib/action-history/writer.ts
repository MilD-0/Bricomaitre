import { actionLogs } from '@bric/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ActionHistoryEntityNotFoundError } from '../action-history-state';
import { isTaxonomyEntity, lockTaxonomyHistory, readTaxonomyRelations } from '../taxonomy-history';
import {
  type ActionActor,
  type ActionOperation,
  type Database,
  type SnapshotRecord,
  type Transaction,
} from './contract';
import { getActionEntityConfig } from './entities';
import { fetchEntity } from './entity-store';
import { serializeSnapshot } from './snapshots';

export async function recordExplicitActionLog(
  tx: Transaction,
  params: {
    entityType: string;
    entityId: number;
    operation: ActionOperation;
    entityLabel?: string;
    beforeState?: SnapshotRecord | null;
    afterState?: SnapshotRecord | null;
    actor?: ActionActor;
    isReversible?: boolean;
  },
) {
  const config = getActionEntityConfig(params.entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${params.entityType}`);
  }

  const labelSource = params.afterState ?? params.beforeState ?? { id: params.entityId };

  await tx
    .update(actionLogs)
    .set({ isReversible: false })
    .where(
      and(
        eq(actionLogs.entityType, params.entityType),
        eq(actionLogs.entityId, params.entityId),
        eq(actionLogs.isUndone, true),
        eq(actionLogs.isReversible, true),
      ),
    );

  await tx.insert(actionLogs).values({
    resource: config.resource,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel ?? config.label(labelSource),
    operation: params.operation,
    beforeState: serializeSnapshot(params.beforeState ?? null),
    afterState: serializeSnapshot(params.afterState ?? null),
    createdBy: params.actor?.email ?? null,
    createdByName: params.actor?.name ?? null,
    isReversible: params.isReversible ?? config.reversible ?? true,
  });
}

export async function mutateEntityWithHistory<T>(
  db: Database,
  params: {
    entityType: string;
    operation: ActionOperation;
    actor?: ActionActor;
    entityId?: number;
    execute: (tx: Transaction, beforeState: SnapshotRecord | null) => Promise<T>;
    resolveEntityId?: (result: T) => number;
    isReversible?: boolean;
    snapshotFields?: { before?: SnapshotRecord; after?: SnapshotRecord };
  },
) {
  return db.transaction((tx) => mutateEntityWithHistoryTransaction(tx, params));
}

export async function mutateEntityWithHistoryTransaction<T>(
  tx: Transaction,
  params: {
    entityType: string;
    operation: ActionOperation;
    actor?: ActionActor;
    entityId?: number;
    execute: (tx: Transaction, beforeState: SnapshotRecord | null) => Promise<T>;
    resolveEntityId?: (result: T) => number;
    isReversible?: boolean;
    snapshotFields?: { before?: SnapshotRecord; after?: SnapshotRecord };
  },
) {
  const entityTable = getActionEntityConfig(params.entityType)?.table;
  if (entityTable && params.entityId) {
    if (isTaxonomyEntity(params.entityType)) {
      await lockTaxonomyHistory(tx, params.entityType, params.entityId);
    } else {
      await tx.execute(
        sql`select ${entityTable.id} from ${entityTable} where ${entityTable.id} = ${params.entityId} for update`,
      );
    }
  }
  const taxonomyDelete =
    isTaxonomyEntity(params.entityType) && params.operation === 'delete' && params.entityId;
  const taxonomyRelations = taxonomyDelete
    ? await readTaxonomyRelations(tx, params.entityType, taxonomyDelete)
    : undefined;
  const beforeState = params.entityId
    ? await fetchEntity(tx, params.entityType, params.entityId)
    : null;
  if (params.operation !== 'create' && !beforeState && params.entityId) {
    throw new ActionHistoryEntityNotFoundError(params.entityType, params.entityId);
  }
  const result = await params.execute(tx, beforeState);
  const entityId = params.resolveEntityId?.(result) ?? params.entityId;

  if (!entityId) {
    throw new Error(`Unable to resolve entity id for ${params.entityType} ${params.operation}`);
  }

  const afterState =
    params.operation === 'delete' ? null : await fetchEntity(tx, params.entityType, entityId);

  const historyVersion = params.entityType === 'products' ? { stockHistoryVersion: 1 } : {};
  await recordExplicitActionLog(tx, {
    entityType: params.entityType,
    entityId,
    operation: params.operation,
    beforeState: beforeState
      ? {
          ...beforeState,
          ...historyVersion,
          ...(taxonomyRelations ? { taxonomyRelations } : {}),
          ...params.snapshotFields?.before,
        }
      : null,
    afterState: afterState
      ? { ...afterState, ...historyVersion, ...params.snapshotFields?.after }
      : null,
    actor: params.actor,
    isReversible: params.isReversible,
  });

  return result;
}
