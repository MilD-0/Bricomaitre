import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import { parseSortRuleStrings } from './multi-sort';
import { normalizePermissions } from './permissions';
import {
  actionLogs,
  adCosts,
  assetBanners,
  brands,
  bulletinPostReactions,
  bulletinPosts,
  bulletinReplies,
  bulletinReplyReactions,
  categories,
  featuredProductGroups,
  importBatches,
  orders,
  productCards,
  products,
  processedOrderProducts,
  processedOrders,
  roleDefinitionPermissions,
  roleDefinitions,
  userAccessGrants,
} from '@bric/db/schema';

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
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type SnapshotRecord = Record<string, unknown>;

type MutableEntityConfig = {
  entityType: string;
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
  timestampKeys: string[];
  reversible?: boolean;
  fetchState?: (tx: Database | Transaction, entityId: number) => Promise<SnapshotRecord | null>;
  insertState?: (tx: Transaction, snapshot: SnapshotRecord) => Promise<void>;
  updateState?: (tx: Transaction, entityId: number, snapshot: SnapshotRecord) => Promise<void>;
  deleteState?: (tx: Transaction, entityId: number) => Promise<void>;
};

export type ActionActor = {
  email?: string | null;
  name?: string | null;
};

export type ActionLogEntry = typeof actionLogs.$inferSelect;

export class ActionHistoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionHistoryConflictError';
  }
}
export type ActionHistoryChange = {
  key: string;
  field: string;
  before: unknown;
  after: unknown;
};

export type ActionHistoryRecoveryReason =
  | 'non_reversible'
  | 'newer_action'
  | 'redo_order'
  | 'history_out_of_sync'
  | 'permission_required';

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

const entityConfigs: Record<string, MutableEntityConfig> = {
  products: {
    entityType: 'products',
    resource: 'products',
    table: products,
    label: (row) => String(row.title ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt', 'publishedAt'],
  },
  orders: {
    entityType: 'orders',
    resource: 'orders',
    table: orders,
    label: (row) =>
      String(
        ([row.firstName, row.lastName].filter(Boolean).join(' ') || row.phoneNumber1) ??
          `#${row.id ?? 'unknown'}`,
      ),
    timestampKeys: ['createdAt', 'updatedAt', 'confirmedAt', 'ecotrackStatusLastUpdate'],
  },
  assets: {
    entityType: 'assets',
    resource: 'assets',
    table: importBatches,
    label: (row) => String(row.fileName ?? row.batchId ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt', 'importedAt'],
  },
  assetBanners: {
    entityType: 'assetBanners',
    resource: 'assets',
    table: assetBanners,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  featuredProductGroups: {
    entityType: 'featuredProductGroups',
    resource: 'assets',
    table: featuredProductGroups,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  productCards: {
    entityType: 'productCards',
    resource: 'assets',
    table: productCards,
    label: (row) => String(row.titleFr ?? row.titleAr ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  bulletinPosts: {
    entityType: 'bulletinPosts',
    resource: 'bulletin',
    table: bulletinPosts,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  bulletinReplies: {
    entityType: 'bulletinReplies',
    resource: 'bulletin',
    table: bulletinReplies,
    label: (row) => String(row.body ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  bulletinPostReactions: {
    entityType: 'bulletinPostReactions',
    resource: 'bulletin',
    table: bulletinPostReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  bulletinReplyReactions: {
    entityType: 'bulletinReplyReactions',
    resource: 'bulletin',
    table: bulletinReplyReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  brandsCategories: {
    entityType: 'brandsCategories',
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  brands: {
    entityType: 'brands',
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  categories: {
    entityType: 'categories',
    resource: 'brandsCategories',
    table: categories,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  statsAdCosts: {
    entityType: 'statsAdCosts',
    resource: 'stats',
    table: adCosts,
    label: (row) =>
      String(
        row.campaignName ?? `${row.platform ?? 'ad'} ${row.date ?? `#${row.id ?? 'unknown'}`}`,
      ),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  statsManualOrders: {
    entityType: 'statsManualOrders',
    resource: 'stats',
    table: processedOrders,
    label: (row) => String(row.tracking ?? row.orderId ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: [
      'createdAt',
      'updatedAt',
      'deliveredAt',
      'orderCreatedAt',
      'encaissedAt',
      'importedAt',
    ],
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
      const allowedKeys = new Set(Object.keys(getTableColumns(processedOrders)));
      await tx.insert(processedOrders).values(cleanSnapshot(orderSnapshot, allowedKeys) as never);

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        const productKeys = new Set(Object.keys(getTableColumns(processedOrderProducts)));
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map(
              (product) => cleanSnapshot(product as SnapshotRecord, productKeys) as never,
            ),
          );
      }
    },
    updateState: async (tx, entityId, snapshot) => {
      const { products: productSnapshot, ...orderSnapshot } = snapshot;
      const allowedKeys = new Set(Object.keys(getTableColumns(processedOrders)));
      await tx
        .update(processedOrders)
        .set(cleanSnapshot(orderSnapshot, allowedKeys) as never)
        .where(eq(processedOrders.id, entityId));

      await tx
        .delete(processedOrderProducts)
        .where(eq(processedOrderProducts.processedOrderId, entityId));

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        const productKeys = new Set(Object.keys(getTableColumns(processedOrderProducts)));
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map(
              (product) => cleanSnapshot(product as SnapshotRecord, productKeys) as never,
            ),
          );
      }
    },
    deleteState: async (tx, entityId) => {
      await tx.delete(processedOrders).where(eq(processedOrders.id, entityId));
    },
  },
  roleDefinitions: {
    entityType: 'roleDefinitions',
    resource: 'settings',
    table: roleDefinitions,
    label: (row) => String(row.name ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
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
      const allowedKeys = new Set(Object.keys(getTableColumns(roleDefinitions)));
      await tx.insert(roleDefinitions).values(cleanSnapshot(roleSnapshot, allowedKeys) as never);

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
      const allowedKeys = new Set(Object.keys(getTableColumns(roleDefinitions)));
      await tx
        .update(roleDefinitions)
        .set(cleanSnapshot(roleSnapshot, allowedKeys) as never)
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
    deleteState: async (tx, entityId) => {
      await tx.delete(roleDefinitions).where(eq(roleDefinitions.id, entityId));
    },
  },
  userAccessGrants: {
    entityType: 'userAccessGrants',
    resource: 'settings',
    table: userAccessGrants,
    label: (row) => String(row.email ?? `#${row.id ?? 'unknown'}`),
    timestampKeys: ['createdAt', 'updatedAt'],
  },
  ecotrackShipments: {
    entityType: 'ecotrackShipments',
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.reference ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'}`,
      ),
    timestampKeys: [
      'createdAt',
      'updatedAt',
      'lastStatusSyncedAt',
      'lastTrackingSyncedAt',
      'lastMajSyncedAt',
      'lastActionAt',
      'deletedAt',
    ],
  },
  ecotrackShipmentMajSync: {
    entityType: 'ecotrackShipmentMajSync',
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} MAJ sync`,
      ),
    timestampKeys: ['latestRemoteCreatedAt'],
  },
  ecotrackShipmentTrackingSync: {
    entityType: 'ecotrackShipmentTrackingSync',
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} tracking sync`,
      ),
    timestampKeys: ['latestEventAt'],
  },
  ecotrackCatalogSyncRuns: {
    entityType: 'ecotrackCatalogSyncRuns',
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(row.trigger ?? row.entityLabel ?? `ECOTRACK sync #${row.id ?? 'unknown'}`),
    timestampKeys: ['startedAt', 'finishedAt', 'previousSuccessfulFinishedAt'],
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

function reviveSnapshot(snapshot: SnapshotRecord | null | undefined, timestampKeys: string[]) {
  if (!snapshot) {
    return null;
  }

  const revived: SnapshotRecord = {};

  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      continue;
    }

    if (timestampKeys.includes(key) && typeof value === 'string') {
      revived[key] = new Date(value);
      continue;
    }

    revived[key] = value;
  }

  return revived;
}

function cleanSnapshot(snapshot: SnapshotRecord | null | undefined, allowedKeys?: Set<string>) {
  if (!snapshot) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(snapshot).filter(
      ([key, value]) => value !== undefined && (!allowedKeys || allowedKeys.has(key)),
    ),
  );
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
  const ignoredKeys = new Set(['id', 'createdAt', 'updatedAt']);

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
  'confirmed',
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

export function getActionHistoryPreview(
  entry: Pick<ActionLogEntry, 'operation' | 'beforeState' | 'afterState'>,
): { items: ActionHistoryPreview[]; total: number } {
  return entry.operation === 'update'
    ? buildActionHistoryPreview(getActionHistoryChanges(entry))
    : { items: [], total: 0 };
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
  const [entry] = await db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.id, actionLogId))
    .limit(1);
  if (!entry) return null;

  const entityHistory = await db
    .select({ id: actionLogs.id, isUndone: actionLogs.isUndone })
    .from(actionLogs)
    .where(and(eq(actionLogs.entityType, entry.entityType), eq(actionLogs.entityId, entry.entityId)))
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

  const allowedKeys = new Set(Object.keys(getTableColumns(config.table)));
  await tx.insert(config.table).values(cleanSnapshot(snapshot, allowedKeys) as never);
}

async function updateEntity(
  tx: Transaction,
  entityType: string,
  entityId: number,
  snapshot: SnapshotRecord,
) {
  const config = getActionEntityConfig(entityType);

  if (!config) {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  if (config.updateState) {
    await config.updateState(tx, entityId, snapshot);
    return;
  }

  if (!config.table) {
    throw new Error(`Entity type ${entityType} does not support updates`);
  }

  const allowedKeys = new Set(Object.keys(getTableColumns(config.table)));
  await tx
    .update(config.table)
    .set(cleanSnapshot(snapshot, allowedKeys) as never)
    .where(eq(config.table.id, entityId));
}

async function deleteEntity(tx: Transaction, entityType: string, entityId: number) {
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

async function recordActionLog(
  tx: Transaction,
  params: {
    entityType: string;
    entityId: number;
    operation: ActionOperation;
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
    entityLabel: config.label(labelSource),
    operation: params.operation,
    beforeState: serializeSnapshot(params.beforeState ?? null),
    afterState: serializeSnapshot(params.afterState ?? null),
    createdBy: params.actor?.email ?? null,
    createdByName: params.actor?.name ?? null,
    isReversible: params.isReversible ?? config.reversible ?? true,
  });
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
  },
) {
  return db.transaction(async (tx) => {
    const beforeState = params.entityId
      ? await fetchEntity(tx, params.entityType, params.entityId)
      : null;
    const result = await params.execute(tx);
    const entityId = params.resolveEntityId?.(result) ?? params.entityId;

    if (!entityId) {
      throw new Error(`Unable to resolve entity id for ${params.entityType} ${params.operation}`);
    }

    const afterState =
      params.operation === 'delete' ? null : await fetchEntity(tx, params.entityType, entityId);

    await recordActionLog(tx, {
      entityType: params.entityType,
      entityId,
      operation: params.operation,
      beforeState,
      afterState,
      actor: params.actor,
      isReversible: params.isReversible,
    });

    return result;
  });
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
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.id, params.actionLogId))
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

    const beforeState = reviveSnapshot(
      entry.beforeState as SnapshotRecord | null,
      config.timestampKeys,
    );
    const afterState = reviveSnapshot(
      entry.afterState as SnapshotRecord | null,
      config.timestampKeys,
    );

    if (params.direction === 'undo') {
      if (entry.operation === 'create') {
        await deleteEntity(tx, entry.entityType, entry.entityId);
      }
      if (entry.operation === 'update' && beforeState) {
        await updateEntity(tx, entry.entityType, entry.entityId, beforeState);
      }
      if (entry.operation === 'delete' && beforeState) {
        await insertEntity(tx, entry.entityType, beforeState);
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
      await updateEntity(tx, entry.entityType, entry.entityId, afterState);
    }
    if (entry.operation === 'delete') {
      await deleteEntity(tx, entry.entityType, entry.entityId);
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
    entry.operation === 'update'
      ? buildActionHistoryPreview(changes)
      : { items: [], total: 0 };
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
