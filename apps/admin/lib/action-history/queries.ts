import { actionLogs } from '@bric/db/schema';
import { and, asc, count, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm';
import {
  actionHistoryQuerySchema,
  ECOTRACK_SYNC_ACTOR_NAME,
  type ActionHistoryListResult,
  type ActionHistoryQuery,
  type ActionHistorySortKey,
  type Database,
} from './contract';
import { resolveActionHistoryRecovery } from './recovery';
import { toActionHistoryItem } from './snapshots';

export async function loadActionHistoryDetail(db: Database, actionLogId: number) {
  const [entry] = await db.select().from(actionLogs).where(eq(actionLogs.id, actionLogId)).limit(1);
  if (!entry) return null;

  const entityHistory = await db
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

  return {
    item: toActionHistoryItem(entry),
    recovery: resolveActionHistoryRecovery(entry, entityHistory),
  };
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
