import type { getDb } from '@bric/db/client';
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
  offPipelineSales,
  orders,
  productCards,
  products,
  roleDefinitions,
  userAccessGrants,
} from '@bric/db/schema';
import { z } from 'zod';
import { parseSortRuleStrings } from '../multi-sort';

export type ActionOperation = 'create' | 'update' | 'delete';

export type ActionHistorySortKey =
  'operation' | 'resource' | 'createdBy' | 'createdAt' | 'isUndone';

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

export const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';

export type Database = ReturnType<typeof getDb>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type SnapshotRecord = Record<string, unknown>;

export type MutableEntityConfig = {
  resource: ActionHistoryResource;
  table?:
    | typeof adCosts
    | typeof products
    | typeof orders
    | typeof importBatches
    | typeof offPipelineSales
    | typeof brands
    | typeof categories
    | typeof assetBanners
    | typeof featuredProductGroups
    | typeof productCards
    | typeof bulletinPosts
    | typeof bulletinReplies
    | typeof bulletinPostReactions
    | typeof bulletinReplyReactions
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
