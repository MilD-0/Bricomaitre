import { eq } from 'drizzle-orm';
import {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
  assertChangedFieldsCurrent,
  snapshotChanges,
  snapshotValues,
} from '../action-history-state';
import { assertCategoryParentAllowed, CategoryHierarchyError } from '../category-hierarchy';
import { assertProductAllocationsCanBeDeleted } from '../stock-allocation-history';
import { type Database, type SnapshotRecord, type Transaction } from './contract';
import { getActionEntityConfig } from './entities';
import { serializeSnapshot } from './snapshots';

export async function fetchEntity(
  tx: Database | Transaction,
  entityType: string,
  entityId: number,
) {
  const config = getActionEntityConfig(entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  if (config.fetchState) {
    return config.fetchState(tx, entityId);
  }

  if (!config.table) {
    throw new Error(`Entity type ${entityType} does not support state fetches`);
  }

  const [row] = await tx.select().from(config.table).where(eq(config.table.id, entityId)).limit(1);
  return row ? (row as SnapshotRecord) : null;
}

async function validateCategoryRecovery(tx: Transaction, id: number, parentId: unknown) {
  try {
    await assertCategoryParentAllowed(tx, id, typeof parentId === 'number' ? parentId : null, {
      lockHierarchy: true,
    });
  } catch (error) {
    if (error instanceof CategoryHierarchyError)
      throw new ActionHistoryConflictError(error.message);
    throw error;
  }
}

export async function insertEntity(tx: Transaction, entityType: string, snapshot: SnapshotRecord) {
  const config = getActionEntityConfig(entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  if (config.insertState) {
    await config.insertState(tx, snapshot);
    return;
  }

  if (!config.table) {
    throw new Error(`Entity type ${entityType} does not support inserts`);
  }

  if (entityType === 'categories')
    await validateCategoryRecovery(tx, Number(snapshot.id), snapshot.parentId);
  await tx.insert(config.table).values(snapshotValues(config.table, snapshot) as never);
}

export async function updateEntity(
  tx: Transaction,
  entityType: string,
  entityId: number,
  snapshot: SnapshotRecord,
  expected?: SnapshotRecord,
) {
  const config = getActionEntityConfig(entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  if (expected) {
    const current = await fetchEntity(tx, entityType, entityId);
    if (!current) throw new ActionHistoryEntityNotFoundError(entityType, entityId);
    assertChangedFieldsCurrent(
      serializeSnapshot(current) as SnapshotRecord,
      serializeSnapshot(snapshot) as SnapshotRecord,
      serializeSnapshot(expected) as SnapshotRecord,
    );
  }
  if (config.updateState) {
    await config.updateState(tx, entityId, snapshot, expected);
    return;
  }

  if (!config.table) {
    throw new Error(`Entity type ${entityType} does not support updates`);
  }

  const changes = snapshotChanges(snapshot, expected);
  if (entityType === 'categories' && 'parentId' in changes)
    await validateCategoryRecovery(tx, entityId, changes.parentId);
  await tx
    .update(config.table)
    .set({
      ...snapshotValues(config.table, changes),
      updatedAt: new Date(),
    } as never)
    .where(eq(config.table.id, entityId));
}

export async function deleteEntity(tx: Transaction, entityType: string, entityId: number) {
  if (entityType === 'products') {
    await assertProductAllocationsCanBeDeleted(tx, entityId);
  }
  const config = getActionEntityConfig(entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  if (config.deleteState) {
    await config.deleteState(tx, entityId);
    return;
  }

  if (!config.table) {
    throw new Error(`Entity type ${entityType} does not support deletes`);
  }

  await tx.delete(config.table).where(eq(config.table.id, entityId));
}
