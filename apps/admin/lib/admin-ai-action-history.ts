import { z } from 'zod';

import { getDb } from '@bric/db/client';
import type { ActionActor } from './action-history';
import {
  actionHistoryQuerySchema,
  applyHistoryAction,
  getActionEntityConfig,
  listActionHistory,
  loadActionHistoryDetail,
  toActionHistoryListItem,
} from './action-history';
import type { PermissionKey } from './permissions';
import { canMutateResource } from './rbac';

const actionHistoryResourceSchema = z.enum([
  'all',
  'products',
  'orders',
  'assets',
  'brandsCategories',
  'bulletin',
  'stats',
  'settings',
  'ecotrack',
]);

export const adminAiActionHistoryInspectionSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('exact'),
      actionLogIds: z.array(z.number().int().positive()).min(1).max(20),
    })
    .strict(),
  z
    .object({
      scope: z.literal('filtered'),
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(20),
      search: z.string().trim().max(200).default(''),
      operation: z.enum(['all', 'create', 'update', 'delete']).default('all'),
      resource: actionHistoryResourceSchema.default('all'),
      state: z.enum(['all', 'applied', 'undone']).default('all'),
      includeEcotrackSync: z.boolean().default(false),
      sortKey: z
        .enum(['operation', 'resource', 'createdBy', 'createdAt', 'isUndone'])
        .default('createdAt'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict(),
]);

export const adminAiActionHistoryRecoverySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            actionLogId: z.number().int().positive(),
            direction: z.enum(['undo', 'redo']),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

function uniqueIds(ids: readonly number[]) {
  return [...new Set(ids)];
}

function permissionAwareRecovery(
  detail: NonNullable<Awaited<ReturnType<typeof loadActionHistoryDetail>>>,
  permissions: readonly PermissionKey[],
) {
  const config = getActionEntityConfig(detail.item.entityType);
  const canRecover = config ? canMutateResource(permissions, config.resource) : false;
  return detail.recovery.nextAction && !canRecover
    ? { nextAction: null, blockedReason: 'permission_required' as const }
    : detail.recovery;
}

async function exactHistory(
  actionLogIds: readonly number[],
  permissions: readonly PermissionKey[],
) {
  const db = getDb();
  const items = [];
  const failures: Array<{ actionLogId: number; message: string }> = [];
  for (const actionLogId of uniqueIds(actionLogIds)) {
    try {
      const detail = await loadActionHistoryDetail(db, actionLogId);
      if (!detail) {
        failures.push({ actionLogId, message: `Action log #${actionLogId} was not found.` });
        continue;
      }
      items.push({ ...detail.item, recovery: permissionAwareRecovery(detail, permissions) });
    } catch (error) {
      failures.push({
        actionLogId,
        message: error instanceof Error ? error.message : 'Unable to inspect action history.',
      });
    }
  }
  return { items, failures };
}

export async function inspectAdminAiActionHistory(
  input: z.input<typeof adminAiActionHistoryInspectionSchema>,
  permissions: readonly PermissionKey[],
) {
  const parsed = adminAiActionHistoryInspectionSchema.parse(input);
  if (parsed.scope === 'exact') {
    const result = await exactHistory(parsed.actionLogIds, permissions);
    return {
      kind: 'action_history' as const,
      scope: parsed.scope,
      requestedCount: uniqueIds(parsed.actionLogIds).length,
      ...result,
    };
  }

  const db = getDb();
  const query = actionHistoryQuerySchema.parse({
    page: parsed.page,
    limit: parsed.limit,
    search: parsed.search,
    operation: parsed.operation,
    resource: parsed.resource,
    state: parsed.state,
    includeEcotrackSync: parsed.includeEcotrackSync,
    sortKey: parsed.sortKey,
    sortDirection: parsed.sortDirection,
  });
  const result = await listActionHistory(db, query);
  const details = await Promise.all(
    result.items.map(async (entry) => {
      const detail = await loadActionHistoryDetail(db, entry.id);
      return {
        ...toActionHistoryListItem(entry),
        recovery: detail
          ? permissionAwareRecovery(detail, permissions)
          : { nextAction: null, blockedReason: 'history_out_of_sync' as const },
      };
    }),
  );
  return {
    kind: 'action_history' as const,
    scope: parsed.scope,
    items: details,
    pagination: result.pagination,
  };
}

export async function recoverAdminAiActionHistory(
  input: z.input<typeof adminAiActionHistoryRecoverySchema>,
  context: { permissions: readonly PermissionKey[]; actor: ActionActor },
) {
  const parsed = adminAiActionHistoryRecoverySchema.parse(input);
  const db = getDb();
  const items = [];
  const failures: Array<{ actionLogId: number; direction: 'undo' | 'redo'; message: string }> = [];

  for (const request of parsed.items) {
    try {
      const detail = await loadActionHistoryDetail(db, request.actionLogId);
      if (!detail) throw new Error('Action log was not found.');
      const config = getActionEntityConfig(detail.item.entityType);
      if (!config || !canMutateResource(context.permissions, config.resource)) {
        throw new Error(`Permission is required to mutate ${detail.item.resource}.`);
      }
      if (detail.recovery.nextAction !== request.direction) {
        const reason = detail.recovery.blockedReason ?? 'history_out_of_sync';
        throw new Error(`Cannot ${request.direction} this action: ${reason}.`);
      }
      await applyHistoryAction(db, {
        actionLogId: request.actionLogId,
        direction: request.direction,
        actor: context.actor,
      });
      const updated = await loadActionHistoryDetail(db, request.actionLogId);
      if (!updated) throw new Error('Recovered action history could not be reloaded.');
      items.push({
        ...updated.item,
        direction: request.direction,
        recovery: permissionAwareRecovery(updated, context.permissions),
      });
    } catch (error) {
      failures.push({
        actionLogId: request.actionLogId,
        direction: request.direction,
        message: error instanceof Error ? error.message : 'Action-history recovery failed.',
      });
    }
  }

  return {
    kind: 'action_history_recovery' as const,
    ok: items.length > 0,
    items,
    failures,
    successCount: items.length,
    failureCount: failures.length,
    totalRequested: parsed.items.length,
  };
}
