import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import {
  actionLogs,
  adCosts,
  assetBanners,
  brands,
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinReplyReactions,
  categories,
  featuredProductGroups,
  importBatches,
  orders,
  processedOrderProducts,
  processedOrders,
  productCards,
  products,
  roleDefinitionPermissions,
  roleDefinitions,
  userAccessGrants,
} from '@bric/db/schema';
import {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
  assertChangedFieldsCurrent,
  fetchOrderState,
  insertOrderState,
  updateOrderState,
  fetchProductState,
  insertProductState,
  updateProductState,
  fetchFeaturedGroupState,
  insertFeaturedGroupState,
  updateFeaturedGroupState,
  snapshotChanges,
  snapshotValues,
} from './action-history-state';
export {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
} from './action-history-state';
import {
  assertNoUnresolvedEcotrackMutation,
  EcotrackMutationConflictError,
} from './ecotrack-mutations';
import { parseSortRuleStrings } from './multi-sort';
import { normalizePermissions } from './permissions';
import {
  assertProductAllocationsCanBeDeleted,
  lockStockAllocationHistory,
  parseStockAllocationChange,
  restoreStockAllocationHistory,
  StockAllocationHistoryConflictError,
} from './stock-allocation-history';
import {
  assertTaxonomyRelationsUnchanged,
  isTaxonomyEntity,
  lockTaxonomyHistory,
  readTaxonomyRelations,
  restoreTaxonomyRelations,
  TaxonomyHistoryConflictError,
} from './taxonomy-history';

export type ActionOperation = 'create' | 'update' | 'delete';
type ActionHistorySortKey = 'operation' | 'resource' | 'createdBy' | 'createdAt' | 'isUndone';
type ActionHistoryResource =
  | 'products'
  | 'orders'
  | 'assets'
  | 'brandsCategories'
  | 'bulletin'
  | 'stats'
  | 'settings'
  | 'ecotrack';
const actionHistorySortKeyValues = [
  'operation',
  'resource',
  'createdBy',
  'createdAt',
  'isUndone',
] as const;
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';

type Database = ReturnType<typeof getDb>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type SnapshotRecord = Record<string, unknown>;

type MutableEntityConfig = {
  resource: ActionHistoryResource;
  table?:
    | typeof adCosts
    | typeof products
    | typeof orders
    | typeof importBatches
    | typeof brands
    | typeof categories
    | typeof assetBanners
    | typeof featuredProductGroups
    | typeof productCards
    | typeof bulletinPosts
    | typeof bulletinReplies
    | typeof bulletinPostReactions
    | typeof bulletinReplyReactions
    | typeof processedOrders
    | typeof roleDefinitions
    | typeof userAccessGrants;
  label: (row: SnapshotRecord) => string;
  reversible?: boolean;
  fetchState?: (tx: Database | Transaction, entityId: number) => Promise<SnapshotRecord | null>;
  insertState?: (tx: Transaction, snapshot: SnapshotRecord) => Promise<void>;
  updateState?: (
    tx: Transaction,
    entityId: number,
    snapshot: SnapshotRecord,
    expected?: SnapshotRecord,
  ) => Promise<void>;
  deleteState?: (tx: Transaction, entityId: number) => Promise<void>;
};

export type ActionActor = {
  email?: string | null;
  name?: string | null;
};

export type ActionLogEntry = typeof actionLogs.$inferSelect;

export type ActionHistoryChange = {
  key: string;
  field: string;
  before: unknown;
  after: unknown;
};

type ActionHistoryRecoveryReason =
  'non_reversible' | 'newer_action' | 'redo_order' | 'history_out_of_sync' | 'permission_required';

export type ActionHistoryRecovery = {
  nextAction: 'undo' | 'redo' | null;
  blockedReason: ActionHistoryRecoveryReason | null;
};

export type ActionHistoryPreview = {
  key: string;
  kind: 'field' | 'group';
  field: string;
};

export const actionHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(''),
    operation: z.enum(['all', 'create', 'update', 'delete']).default('all'),
    resource: z
      .enum([
        'all',
        'products',
        'orders',
        'assets',
        'brandsCategories',
        'bulletin',
        'stats',
        'settings',
        'ecotrack',
      ])
      .default('all'),
    state: z.enum(['all', 'applied', 'undone']).default('all'),
    includeEcotrackSync: z
      .preprocess((value) => {
        if (typeof value === 'boolean') {
          return value;
        }

        if (typeof value === 'string') {
          return value === 'true';
        }

        return false;
      }, z.boolean())
      .default(false),
    sort: z.array(z.string().trim()).optional().default([]),
    sortKey: z.enum(actionHistorySortKeyValues).default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .transform((value, ctx) => {
    const parsedSortRules = parseSortRuleStrings(value.sort, actionHistorySortKeyValues);

    if (!parsedSortRules.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: parsedSortRules.issue,
        path: ['sort'],
      });

      return z.NEVER;
    }

    return {
      ...value,
      sortRules:
        parsedSortRules.rules.length > 0
          ? parsedSortRules.rules
          : [{ key: value.sortKey, direction: value.sortDirection }],
    };
  });

export type ActionHistoryQuery = z.infer<typeof actionHistoryQuerySchema>;
type ActionHistoryPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
export type ActionHistoryListResult = {
  items: ActionLogEntry[];
  pagination: ActionHistoryPagination;
};

const bulletinRelatedTables = {
  tags: bulletinPostTags,
  attachments: bulletinPostAttachments,
  replies: bulletinReplies,
  reactions: bulletinPostReactions,
  replyReactions: bulletinReplyReactions,
};

async function restoreBulletinRows(
  tx: Transaction,
  snapshot: SnapshotRecord,
  keys: Array<keyof typeof bulletinRelatedTables>,
) {
  for (const key of keys) {
    const rows = snapshot[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    const table = bulletinRelatedTables[key];
    await tx
      .insert(table)
      .values(rows.map((row) => snapshotValues(table, row as SnapshotRecord)) as never);
  }
}

async function fetchBulletinPostState(tx: Database | Transaction, entityId: number) {
  const [post] = await tx
    .select()
    .from(bulletinPosts)
    .where(eq(bulletinPosts.id, entityId))
    .limit(1);
  if (!post) return null;
  const tags = await tx
    .select()
    .from(bulletinPostTags)
    .where(eq(bulletinPostTags.postId, entityId))
    .orderBy(asc(bulletinPostTags.tagId));
  const attachments = await tx
    .select()
    .from(bulletinPostAttachments)
    .where(eq(bulletinPostAttachments.postId, entityId))
    .orderBy(asc(bulletinPostAttachments.id));
  const replies = await tx
    .select()
    .from(bulletinReplies)
    .where(eq(bulletinReplies.postId, entityId))
    .orderBy(asc(bulletinReplies.id));
  const reactions = await tx
    .select()
    .from(bulletinPostReactions)
    .where(eq(bulletinPostReactions.postId, entityId))
    .orderBy(asc(bulletinPostReactions.id));
  const replyReactions = replies.length
    ? await tx
        .select()
        .from(bulletinReplyReactions)
        .where(
          inArray(
            bulletinReplyReactions.replyId,
            replies.map((reply) => reply.id),
          ),
        )
        .orderBy(asc(bulletinReplyReactions.id))
    : [];
  return { ...post, tags, attachments, replies, reactions, replyReactions };
}

const entityConfigs: Record<string, MutableEntityConfig> = {
  products: {
    resource: 'products',
    table: products,
    label: (row) => String(row.title ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchProductState,
    insertState: insertProductState,
    updateState: updateProductState,
  },
  orders: {
    resource: 'orders',
    table: orders,
    label: (row) =>
      String(
        ([row.firstName, row.lastName].filter(Boolean).join(' ') || row.phoneNumber1) ??
          `#${row.id ?? 'unknown'}`,
      ),
    fetchState: fetchOrderState,
    insertState: insertOrderState,
    updateState: updateOrderState,
  },
  assets: {
    resource: 'assets',
    table: importBatches,
    label: (row) => String(row.fileName ?? row.batchId ?? `#${row.id ?? 'unknown'}`),
  },
  assetBanners: {
    resource: 'assets',
    table: assetBanners,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
  },
  featuredProductGroups: {
    resource: 'assets',
    table: featuredProductGroups,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchFeaturedGroupState,
    insertState: insertFeaturedGroupState,
    updateState: updateFeaturedGroupState,
  },
  productCards: {
    resource: 'assets',
    table: productCards,
    label: (row) => String(row.titleFr ?? row.titleAr ?? `#${row.id ?? 'unknown'}`),
  },
  bulletinPosts: {
    resource: 'bulletin',
    table: bulletinPosts,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchBulletinPostState,
    insertState: async (tx, snapshot) => {
      await tx.insert(bulletinPosts).values(snapshotValues(bulletinPosts, snapshot));
      await restoreBulletinRows(tx, snapshot, [
        'tags',
        'attachments',
        'replies',
        'reactions',
        'replyReactions',
      ]);
    },
    updateState: async (tx, entityId, snapshot) => {
      await tx
        .update(bulletinPosts)
        .set(snapshotValues(bulletinPosts, snapshot))
        .where(eq(bulletinPosts.id, entityId));
      // Post edits own tags and attachments. Replies and reactions may have been
      // added independently since that edit and must not be replaced by undo.
      if (Array.isArray(snapshot.tags)) {
        await tx.delete(bulletinPostTags).where(eq(bulletinPostTags.postId, entityId));
      }
      if (Array.isArray(snapshot.attachments)) {
        await tx
          .delete(bulletinPostAttachments)
          .where(eq(bulletinPostAttachments.postId, entityId));
      }
      await restoreBulletinRows(tx, snapshot, ['tags', 'attachments']);
    },
  },
  bulletinReplies: {
    resource: 'bulletin',
    table: bulletinReplies,
    label: (row) => String(row.body ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [reply] = await tx
        .select()
        .from(bulletinReplies)
        .where(eq(bulletinReplies.id, entityId))
        .limit(1);
      if (!reply) return null;
      const replyReactions = await tx
        .select()
        .from(bulletinReplyReactions)
        .where(eq(bulletinReplyReactions.replyId, entityId))
        .orderBy(asc(bulletinReplyReactions.id));
      return { ...reply, replyReactions };
    },
    insertState: async (tx, snapshot) => {
      await tx.insert(bulletinReplies).values(snapshotValues(bulletinReplies, snapshot));
      await restoreBulletinRows(tx, snapshot, ['replyReactions']);
    },
  },
  bulletinPostReactions: {
    resource: 'bulletin',
    table: bulletinPostReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  bulletinReplyReactions: {
    resource: 'bulletin',
    table: bulletinReplyReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  brandsCategories: {
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  brands: {
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  categories: {
    resource: 'brandsCategories',
    table: categories,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  statsAdCosts: {
    resource: 'stats',
    table: adCosts,
    label: (row) =>
      String(
        row.campaignName ?? `${row.platform ?? 'ad'} ${row.date ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  statsManualOrders: {
    resource: 'stats',
    table: processedOrders,
    label: (row) => String(row.tracking ?? row.orderId ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [order] = await tx
        .select()
        .from(processedOrders)
        .where(eq(processedOrders.id, entityId))
        .limit(1);

      if (!order) {
        return null;
      }

      const products = await tx
        .select()
        .from(processedOrderProducts)
        .where(eq(processedOrderProducts.processedOrderId, entityId))
        .orderBy(asc(processedOrderProducts.id));

      return {
        ...order,
        products,
      };
    },
    insertState: async (tx, snapshot) => {
      const { products: productSnapshot, ...orderSnapshot } = snapshot;
      await tx.insert(processedOrders).values(snapshotValues(processedOrders, orderSnapshot));

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map((product) =>
              snapshotValues(processedOrderProducts, product as SnapshotRecord),
            ),
          );
      }
    },
    updateState: async (tx, entityId, snapshot) => {
      const { products: productSnapshot, ...orderSnapshot } = snapshot;
      await tx
        .update(processedOrders)
        .set(snapshotValues(processedOrders, orderSnapshot))
        .where(eq(processedOrders.id, entityId));

      await tx
        .delete(processedOrderProducts)
        .where(eq(processedOrderProducts.processedOrderId, entityId));

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map((product) =>
              snapshotValues(processedOrderProducts, product as SnapshotRecord),
            ),
          );
      }
    },
  },
  roleDefinitions: {
    resource: 'settings',
    table: roleDefinitions,
    label: (row) => String(row.name ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [role] = await tx
        .select()
        .from(roleDefinitions)
        .where(eq(roleDefinitions.id, entityId))
        .limit(1);

      if (!role) {
        return null;
      }

      const permissions = await tx
        .select()
        .from(roleDefinitionPermissions)
        .where(eq(roleDefinitionPermissions.roleId, entityId))
        .orderBy(asc(roleDefinitionPermissions.permission));

      return {
        ...role,
        permissions: permissions.map((permission) => permission.permission),
      };
    },
    insertState: async (tx, snapshot) => {
      const { permissions, ...roleSnapshot } = snapshot;
      await tx.insert(roleDefinitions).values(snapshotValues(roleDefinitions, roleSnapshot));

      const normalizedPermissions = normalizePermissions(permissions);
      if (normalizedPermissions.length > 0) {
        await tx.insert(roleDefinitionPermissions).values(
          normalizedPermissions.map((permission) => ({
            roleId: Number(roleSnapshot.id),
            permission,
          })),
        );
      }
    },
    updateState: async (tx, entityId, snapshot) => {
      const { permissions, ...roleSnapshot } = snapshot;
      await tx
        .update(roleDefinitions)
        .set(snapshotValues(roleDefinitions, roleSnapshot))
        .where(eq(roleDefinitions.id, entityId));

      await tx
        .delete(roleDefinitionPermissions)
        .where(eq(roleDefinitionPermissions.roleId, entityId));

      const normalizedPermissions = normalizePermissions(permissions);
      if (normalizedPermissions.length > 0) {
        await tx.insert(roleDefinitionPermissions).values(
          normalizedPermissions.map((permission) => ({
            roleId: entityId,
            permission,
          })),
        );
      }
    },
  },
  userAccessGrants: {
    resource: 'settings',
    table: userAccessGrants,
    label: (row) => String(row.email ?? `#${row.id ?? 'unknown'}`),
  },
  ecotrackShipments: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.reference ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'}`,
      ),
  },
  ecotrackShipmentMajSync: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} MAJ sync`,
      ),
  },
  ecotrackShipmentTrackingSync: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} tracking sync`,
      ),
  },
  ecotrackCatalogSyncRuns: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(row.trigger ?? row.entityLabel ?? `ECOTRACK sync #${row.id ?? 'unknown'}`),
  },
};

export function getActionEntityConfig(entityType: string) {
  return entityConfigs[entityType] ?? null;
}

function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializeSnapshot(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeSnapshot);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, serializeSnapshot(entry)])
        .filter(([, entry]) => entry !== undefined),
    );
  }
  return value;
}

function areValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(serializeSnapshot(left)) === JSON.stringify(serializeSnapshot(right));
}

function humanizeFieldName(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function getActionHistoryChanges(
  entry: Pick<ActionLogEntry, 'operation' | 'beforeState' | 'afterState'>,
): ActionHistoryChange[] {
  const beforeState = isRecord(entry.beforeState) ? entry.beforeState : {};
  const afterState = isRecord(entry.afterState) ? entry.afterState : {};
  const ignoredKeys = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'stockAllocations',
    'stockHistoryVersion',
  ]);

  return [...new Set([...Object.keys(beforeState), ...Object.keys(afterState)])]
    .filter((key) => !ignoredKeys.has(key))
    .filter((key) => !areValuesEqual(beforeState[key], afterState[key]))
    .map((key) => ({
      key,
      field: humanizeFieldName(key),
      before: beforeState[key] ?? null,
      after: afterState[key] ?? null,
    }));
}

const confirmationFieldKeys = new Set([
  'inHouseStatus',
  'confirmedAt',
  'confirmedBy',
  'confirmedByName',
  'noAnswerCount',
]);
const shipmentFieldKeys = new Set([
  'ecotrackReference',
  'ecotrackStatus',
  'ecotrackStatusLastUpdate',
  'ecotrackTrackingNumber',
]);

function buildActionHistoryPreview(changes: ActionHistoryChange[]): {
  items: ActionHistoryPreview[];
  total: number;
} {
  const items: ActionHistoryPreview[] = [];
  if (changes.some((change) => confirmationFieldKeys.has(change.key))) {
    items.push({ key: 'confirmation', kind: 'group', field: 'Confirmation' });
  }
  if (changes.some((change) => shipmentFieldKeys.has(change.key))) {
    items.push({ key: 'shipment', kind: 'group', field: 'Shipment' });
  }
  for (const change of changes) {
    if (confirmationFieldKeys.has(change.key) || shipmentFieldKeys.has(change.key)) continue;
    items.push({ key: change.key, kind: 'field', field: change.field });
  }

  return { items: items.slice(0, 2), total: items.length };
}

export function resolveActionHistoryRecovery(
  entry: Pick<ActionLogEntry, 'id' | 'isReversible' | 'isUndone'>,
  entityHistory: Array<Pick<ActionLogEntry, 'id' | 'isUndone'>>,
): ActionHistoryRecovery {
  if (!entry.isReversible) {
    return { nextAction: null, blockedReason: 'non_reversible' };
  }

  const entryIndex = entityHistory.findIndex((historyEntry) => historyEntry.id === entry.id);
  if (entryIndex === -1) {
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

export async function loadActionHistoryDetail(db: Database, actionLogId: number) {
  const [entry] = await db.select().from(actionLogs).where(eq(actionLogs.id, actionLogId)).limit(1);
  if (!entry) return null;

  const entityHistory = await db
    .select({ id: actionLogs.id, isUndone: actionLogs.isUndone })
    .from(actionLogs)
    .where(
      and(eq(actionLogs.entityType, entry.entityType), eq(actionLogs.entityId, entry.entityId)),
    )
    .orderBy(asc(actionLogs.createdAt), asc(actionLogs.id));

  return {
    item: toActionHistoryItem(entry),
    recovery: resolveActionHistoryRecovery(entry, entityHistory),
  };
}

async function fetchEntity(tx: Database | Transaction, entityType: string, entityId: number) {
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

async function insertEntity(tx: Transaction, entityType: string, snapshot: SnapshotRecord) {
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

  await tx.insert(config.table).values(snapshotValues(config.table, snapshot) as never);
}

async function updateEntity(
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

  await tx
    .update(config.table)
    .set({
      ...snapshotValues(config.table, snapshotChanges(snapshot, expected)),
      updatedAt: new Date(),
    } as never)
    .where(eq(config.table.id, entityId));
}

async function deleteEntity(tx: Transaction, entityType: string, entityId: number) {
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
    execute: (tx: Transaction) => Promise<T>;
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
    execute: (tx: Transaction) => Promise<T>;
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
  const result = await params.execute(tx);
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

export async function listActionHistory(
  db: Database,
  queryInput: Partial<ActionHistoryQuery> = {},
): Promise<ActionHistoryListResult> {
  const query = actionHistoryQuerySchema.parse(queryInput);
  const filters = [
    query.search
      ? or(
          ilike(actionLogs.entityLabel, `%${query.search}%`),
          ilike(actionLogs.entityType, `%${query.search}%`),
          ilike(actionLogs.resource, `%${query.search}%`),
          ilike(actionLogs.operation, `%${query.search}%`),
          ilike(actionLogs.createdBy, `%${query.search}%`),
          ilike(actionLogs.createdByName, `%${query.search}%`),
        )
      : undefined,
    query.operation === 'all' ? undefined : eq(actionLogs.operation, query.operation),
    query.resource === 'all' ? undefined : eq(actionLogs.resource, query.resource),
    query.state === 'all' ? undefined : eq(actionLogs.isUndone, query.state === 'undone'),
    query.includeEcotrackSync
      ? undefined
      : or(
          isNull(actionLogs.createdByName),
          ne(actionLogs.createdByName, ECOTRACK_SYNC_ACTOR_NAME),
        ),
  ].filter((value) => value !== undefined);
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(actionLogs)
    .where(whereClause);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const orderBy = query.sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;

    return (
      {
        operation: [direction(actionLogs.operation)],
        resource: [direction(actionLogs.resource)],
        createdBy: [direction(actionLogs.createdByName), direction(actionLogs.createdBy)],
        createdAt: [direction(actionLogs.createdAt)],
        isUndone: [direction(actionLogs.isUndone)],
      } satisfies Record<ActionHistorySortKey, unknown[]>
    )[rule.key];
  });

  const items = await db
    .select()
    .from(actionLogs)
    .where(whereClause)
    .orderBy(...orderBy, desc(actionLogs.id))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  return {
    items,
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
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
      const [entry] = await tx
        .select()
        .from(actionLogs)
        .where(eq(actionLogs.id, params.actionLogId))
        .for('update')
        .limit(1);

      if (!entry) {
        throw new ActionHistoryConflictError('Action log not found');
      }

      if (params.direction === 'undo' && entry.isUndone) {
        throw new ActionHistoryConflictError('Action already undone');
      }

      if (params.direction === 'redo' && !entry.isUndone) {
        throw new ActionHistoryConflictError('Action has not been undone');
      }

      if (!entry.isReversible) {
        throw new ActionHistoryConflictError(
          params.direction === 'undo'
            ? 'This action cannot be undone.'
            : 'This action cannot be redone.',
        );
      }

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

      const entityHistory = await tx
        .select({
          id: actionLogs.id,
          isUndone: actionLogs.isUndone,
        })
        .from(actionLogs)
        .where(
          and(eq(actionLogs.entityType, entry.entityType), eq(actionLogs.entityId, entry.entityId)),
        )
        .orderBy(asc(actionLogs.createdAt), asc(actionLogs.id));

      if (!entityHistory.some((historyEntry) => historyEntry.id === entry.id)) {
        throw new ActionHistoryConflictError('Action log history is unavailable');
      }

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

export function toActionHistoryItem(entry: ActionLogEntry) {
  return {
    id: entry.id,
    resource: entry.resource,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    operation: entry.operation,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName,
    isReversible: entry.isReversible,
    isUndone: entry.isUndone,
    changes: getActionHistoryChanges(entry),
    createdAt: entry.createdAt.toISOString(),
    undoneAt: entry.undoneAt?.toISOString() ?? null,
    redoneAt: entry.redoneAt?.toISOString() ?? null,
  };
}

export function toActionHistoryListItem(entry: ActionLogEntry) {
  const changes = getActionHistoryChanges(entry);
  const preview =
    entry.operation === 'update' ? buildActionHistoryPreview(changes) : { items: [], total: 0 };
  return {
    id: entry.id,
    resource: entry.resource,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    operation: entry.operation,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName,
    isReversible: entry.isReversible,
    isUndone: entry.isUndone,
    changeCount: changes.length,
    changePreview: preview.items,
    semanticChangeCount: preview.total,
    createdAt: entry.createdAt.toISOString(),
  };
}
