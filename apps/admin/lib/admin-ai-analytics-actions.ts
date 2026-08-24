import { z } from 'zod';

import { refreshAnalytics2FactsAfterMutation } from './analytics2-facts';
import { syncMetaAdsInsights } from './meta-ads-insights';
import {
  createProfitTrackerCost,
  deleteProfitTrackerCost,
  deleteProfitTrackerDay,
  getProfitTrackerSettings,
  listProfitTrackerCosts,
  updateProfitTrackerCost,
  updateProfitTrackerSettings,
  upsertProfitTrackerDay,
} from './profit-tracker';
import { syncSearchConsole } from './search-console';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Exact Africa/Algiers business date in YYYY-MM-DD format.');

const fxRateSchema = z
  .number()
  .finite()
  .positive()
  .max(100_000)
  .describe('Manual DZD per EUR rate to use in future calculator snapshots.');
const planningReturnRateSchema = z
  .number()
  .finite()
  .min(0)
  .max(100)
  .describe(
    'Manual planning return percentage used by projections; never substitute an observed rate unless the operator explicitly adopts it.',
  );
const fridayRestFromSchema = dateSchema
  .nullable()
  .describe('Activation date for Friday calculator rest-day accounting, or null to disable it.');

export const adminAiAnalyticsSettingsPatchSchema = z
  .object({
    fxRate: fxRateSchema.optional(),
    planningReturnRate: planningReturnRateSchema.optional(),
    fridayRestFrom: fridayRestFromSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one settings change.');

function normalizedActionMessage(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

function includesAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term));
}

/** Exposes only settings explicitly named by the operator. */
export function adminAiAnalyticsSettingsPatchSchemaForMessage(
  rawMessage: string,
): typeof adminAiAnalyticsSettingsPatchSchema {
  const message = normalizedActionMessage(rawMessage);
  const shape: Record<string, z.ZodType> = {};
  if (
    includesAny(message, [
      'taux de retour',
      'taux de planification',
      'planning return',
      'return rate',
      'معدل الإرجاع',
    ])
  ) {
    shape.planningReturnRate = planningReturnRateSchema;
  }
  if (includesAny(message, ['taux de change', 'fx', 'eur vers dzd', 'eur to dzd', 'سعر الصرف'])) {
    shape.fxRate = fxRateSchema;
  }
  if (includesAny(message, ['vendredi', 'friday', 'الجمعة'])) {
    shape.fridayRestFrom = fridayRestFromSchema;
  }
  if (Object.keys(shape).length === 0) return adminAiAnalyticsSettingsPatchSchema;
  return z.object(shape).strict() as unknown as typeof adminAiAnalyticsSettingsPatchSchema;
}

type AnalyticsSettingsDependencies = {
  getSettings: typeof getProfitTrackerSettings;
  updateSettings: typeof updateProfitTrackerSettings;
  refreshFacts: typeof refreshAnalytics2FactsAfterMutation;
};

const defaultSettingsDependencies: AnalyticsSettingsDependencies = {
  getSettings: getProfitTrackerSettings,
  updateSettings: updateProfitTrackerSettings,
  refreshFacts: refreshAnalytics2FactsAfterMutation,
};

export async function updateAdminAiAnalyticsSettings(
  raw: z.input<typeof adminAiAnalyticsSettingsPatchSchema>,
  dependencies: AnalyticsSettingsDependencies = defaultSettingsDependencies,
) {
  const changes = adminAiAnalyticsSettingsPatchSchema.parse(raw);
  const previous = await dependencies.getSettings();
  const current = await dependencies.updateSettings({
    fxRate: changes.fxRate ?? previous.fxRate,
    defaultReturnRate: changes.planningReturnRate ?? previous.defaultReturnRate,
    restFrom: changes.fridayRestFrom === undefined ? previous.restFrom : changes.fridayRestFrom,
  });
  await dependencies.refreshFacts();
  return {
    kind: 'analytics_settings' as const,
    previous: {
      fxRate: previous.fxRate,
      planningReturnRate: previous.defaultReturnRate,
      fridayRestFrom: previous.restFrom,
    },
    current: {
      fxRate: current.fxRate,
      planningReturnRate: current.defaultReturnRate,
      fridayRestFrom: current.restFrom,
    },
    changedFields: Object.keys(changes),
  };
}

const costFieldsBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    amountDzd: z.number().finite().nonnegative().max(1_000_000_000_000),
    period: z.enum(['monthly', 'once']),
    startDate: dateSchema,
    endDate: dateSchema.nullable(),
  })
  .strict();

const costFieldsSchema = costFieldsBaseSchema
  .extend({ endDate: dateSchema.nullable().default(null) })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'endDate must not precede startDate.',
    path: ['endDate'],
  });

const costChangesSchema = costFieldsBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one cost change.');

const costOperationSchema = z.discriminatedUnion('action', [
  costFieldsSchema.safeExtend({ action: z.literal('create') }),
  z
    .object({
      action: z.literal('update'),
      id: z.number().int().positive(),
      changes: costChangesSchema,
    })
    .strict(),
  z.object({ action: z.literal('delete'), id: z.number().int().positive() }).strict(),
]);

export const adminAiAnalyticsCostsMutationSchema = z
  .object({ operations: z.array(costOperationSchema).min(1).max(20) })
  .strict();

/** Narrows cost mutations to the requested operation and explicitly named update fields. */
export function adminAiAnalyticsCostsMutationSchemaForMessage(
  rawMessage: string,
): typeof adminAiAnalyticsCostsMutationSchema {
  const message = normalizedActionMessage(rawMessage);
  if (includesAny(message, ['supprime', 'delete', 'remove', 'احذف'])) {
    return z
      .object({
        operations: z
          .array(
            z.object({ action: z.literal('delete'), id: z.number().int().positive() }).strict(),
          )
          .min(1)
          .max(20),
      })
      .strict() as unknown as typeof adminAiAnalyticsCostsMutationSchema;
  }
  if (includesAny(message, ['ajoute', 'cree', 'create', 'add ', 'أضف'])) {
    return z
      .object({
        operations: z
          .array(costFieldsSchema.safeExtend({ action: z.literal('create') }))
          .min(1)
          .max(20),
      })
      .strict() as unknown as typeof adminAiAnalyticsCostsMutationSchema;
  }

  const changesShape: Record<string, z.ZodType> = {};
  if (includesAny(message, ['nom', 'name', 'اسم']))
    changesShape.name = costFieldsBaseSchema.shape.name;
  if (includesAny(message, ['montant', 'amount', 'dzd', 'دج', 'المبلغ'])) {
    changesShape.amountDzd = costFieldsBaseSchema.shape.amountDzd;
  }
  if (
    includesAny(message, ['periode', 'period', 'mensuel', 'monthly', 'ponctuel', 'once', 'شهري'])
  ) {
    changesShape.period = costFieldsBaseSchema.shape.period;
  }
  if (includesAny(message, ['debut', 'start', 'a partir', 'ابتداء'])) {
    changesShape.startDate = costFieldsBaseSchema.shape.startDate;
  }
  if (includesAny(message, ['fin', 'end', "jusqu'a", 'حتى'])) {
    changesShape.endDate = costFieldsBaseSchema.shape.endDate;
  }
  if (Object.keys(changesShape).length === 0) return adminAiAnalyticsCostsMutationSchema;
  return z
    .object({
      operations: z
        .array(
          z
            .object({
              action: z.literal('update'),
              id: z.number().int().positive(),
              changes: z.object(changesShape).strict(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict() as unknown as typeof adminAiAnalyticsCostsMutationSchema;
}

type AnalyticsCostDependencies = {
  listCosts: typeof listProfitTrackerCosts;
  createCost: typeof createProfitTrackerCost;
  updateCost: typeof updateProfitTrackerCost;
  deleteCost: typeof deleteProfitTrackerCost;
  refreshFacts: typeof refreshAnalytics2FactsAfterMutation;
};

const defaultCostDependencies: AnalyticsCostDependencies = {
  listCosts: listProfitTrackerCosts,
  createCost: createProfitTrackerCost,
  updateCost: updateProfitTrackerCost,
  deleteCost: deleteProfitTrackerCost,
  refreshFacts: refreshAnalytics2FactsAfterMutation,
};

export async function manageAdminAiAnalyticsCosts(
  raw: z.input<typeof adminAiAnalyticsCostsMutationSchema>,
  dependencies: AnalyticsCostDependencies = defaultCostDependencies,
) {
  const { operations } = adminAiAnalyticsCostsMutationSchema.parse(raw);
  const currentById = new Map((await dependencies.listCosts()).map((cost) => [cost.id, cost]));
  const results: Array<Record<string, unknown>> = [];
  let changedCount = 0;

  for (const [index, operation] of operations.entries()) {
    try {
      if (operation.action === 'create') {
        const input = {
          name: operation.name,
          amountDzd: operation.amountDzd,
          period: operation.period,
          startDate: operation.startDate,
          endDate: operation.endDate,
        };
        const current = await dependencies.createCost(input);
        currentById.set(current.id, current);
        changedCount += 1;
        results.push({ index, action: operation.action, status: 'created', current });
        continue;
      }

      const previous = currentById.get(operation.id);
      if (!previous) {
        results.push({
          index,
          action: operation.action,
          id: operation.id,
          status: 'not_found',
        });
        continue;
      }

      if (operation.action === 'delete') {
        const deletedId = await dependencies.deleteCost(operation.id);
        if (!deletedId) {
          results.push({
            index,
            action: operation.action,
            id: operation.id,
            status: 'not_found',
          });
          continue;
        }
        currentById.delete(operation.id);
        changedCount += 1;
        results.push({
          index,
          action: operation.action,
          id: operation.id,
          status: 'deleted',
          previous,
        });
        continue;
      }

      const current = await dependencies.updateCost(operation.id, {
        name: operation.changes.name ?? previous.name,
        amountDzd: operation.changes.amountDzd ?? previous.amountDzd,
        period: operation.changes.period ?? previous.period,
        startDate: operation.changes.startDate ?? previous.startDate,
        endDate:
          operation.changes.endDate === undefined ? previous.endDate : operation.changes.endDate,
      });
      if (!current) {
        results.push({
          index,
          action: operation.action,
          id: operation.id,
          status: 'not_found',
        });
        continue;
      }
      currentById.set(current.id, current);
      changedCount += 1;
      results.push({ index, action: operation.action, status: 'updated', previous, current });
    } catch (error) {
      results.push({
        index,
        action: operation.action,
        id: 'id' in operation ? operation.id : null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Analytics cost mutation failed.',
      });
    }
  }

  if (changedCount > 0) await dependencies.refreshFacts();
  return {
    kind: 'analytics_costs' as const,
    requestedCount: operations.length,
    changedCount,
    results,
  };
}

const dayOverrideChangesSchema = z
  .object({
    grossProfitDzd: z.number().finite().nullable().optional(),
    planningReturnRate: z.number().finite().min(0).max(100).nullable().optional(),
    confirmedOrders: z.number().int().nonnegative().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one daily override change.');

const dayOperationSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('upsert'), date: dateSchema, changes: dayOverrideChangesSchema })
    .strict(),
  z.object({ action: z.literal('reset'), date: dateSchema }).strict(),
]);

export const adminAiAnalyticsDayOverridesMutationSchema = z
  .object({ operations: z.array(dayOperationSchema).min(1).max(20) })
  .strict();

/** Restricts a daily write to reset or to the exact value kinds named by the operator. */
export function adminAiAnalyticsDayOverridesMutationSchemaForMessage(
  rawMessage: string,
): typeof adminAiAnalyticsDayOverridesMutationSchema {
  const message = normalizedActionMessage(rawMessage);
  if (includesAny(message, ['reinitialise', 'reset', 'supprime', 'efface', 'إعادة تعيين'])) {
    return z
      .object({
        operations: z
          .array(z.object({ action: z.literal('reset'), date: dateSchema }).strict())
          .min(1)
          .max(20),
      })
      .strict() as unknown as typeof adminAiAnalyticsDayOverridesMutationSchema;
  }

  const changesShape: Record<string, z.ZodType> = {};
  if (includesAny(message, ['profit brut', 'gross profit', 'الربح الإجمالي'])) {
    changesShape.grossProfitDzd = z.number().finite().nullable();
  }
  if (
    includesAny(message, [
      'taux de retour',
      'taux de planification',
      'planning return',
      'return rate',
      'معدل الإرجاع',
    ])
  ) {
    changesShape.planningReturnRate = z.number().finite().min(0).max(100).nullable();
  }
  if (includesAny(message, ['commandes confirmees', 'confirmed orders', 'الطلبات المؤكدة'])) {
    changesShape.confirmedOrders = z.number().int().nonnegative().nullable();
  }
  if (includesAny(message, ['note', 'ملاحظة'])) {
    changesShape.note = z.string().trim().max(500).nullable();
  }
  if (Object.keys(changesShape).length === 0) {
    return adminAiAnalyticsDayOverridesMutationSchema;
  }
  return z
    .object({
      operations: z
        .array(
          z
            .object({
              action: z.literal('upsert'),
              date: dateSchema,
              changes: z.object(changesShape).strict(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict() as unknown as typeof adminAiAnalyticsDayOverridesMutationSchema;
}

type AnalyticsDayDependencies = {
  upsertDay: typeof upsertProfitTrackerDay;
  deleteDay: typeof deleteProfitTrackerDay;
  refreshFacts: typeof refreshAnalytics2FactsAfterMutation;
};

const defaultDayDependencies: AnalyticsDayDependencies = {
  upsertDay: upsertProfitTrackerDay,
  deleteDay: deleteProfitTrackerDay,
  refreshFacts: refreshAnalytics2FactsAfterMutation,
};

export async function manageAdminAiAnalyticsDayOverrides(
  raw: z.input<typeof adminAiAnalyticsDayOverridesMutationSchema>,
  dependencies: AnalyticsDayDependencies = defaultDayDependencies,
) {
  const { operations } = adminAiAnalyticsDayOverridesMutationSchema.parse(raw);
  const results: Array<Record<string, unknown>> = [];
  let changedCount = 0;

  for (const [index, operation] of operations.entries()) {
    try {
      if (operation.action === 'reset') {
        const deletedDate = await dependencies.deleteDay(operation.date);
        if (!deletedDate) {
          results.push({
            index,
            action: operation.action,
            date: operation.date,
            status: 'not_found',
          });
          continue;
        }
        changedCount += 1;
        results.push({ index, action: operation.action, date: deletedDate, status: 'reset' });
        continue;
      }

      const current = await dependencies.upsertDay({
        date: operation.date,
        ...(operation.changes.grossProfitDzd !== undefined
          ? { grossProfitDzd: operation.changes.grossProfitDzd }
          : {}),
        ...(operation.changes.planningReturnRate !== undefined
          ? { returnRatePct: operation.changes.planningReturnRate }
          : {}),
        ...(operation.changes.confirmedOrders !== undefined
          ? { confirmedOrders: operation.changes.confirmedOrders }
          : {}),
        ...(operation.changes.note !== undefined ? { note: operation.changes.note } : {}),
      });
      changedCount += 1;
      results.push({
        index,
        action: operation.action,
        date: operation.date,
        status: 'saved',
        current,
      });
    } catch (error) {
      results.push({
        index,
        action: operation.action,
        date: operation.date,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Analytics day mutation failed.',
      });
    }
  }

  if (changedCount > 0) await dependencies.refreshFacts();
  return {
    kind: 'analytics_day_overrides' as const,
    requestedCount: operations.length,
    changedCount,
    results,
  };
}

function analyticsSyncSchema(sourceSchema: z.ZodType<'meta' | 'searchConsole'>) {
  return z
    .object({
      source: sourceSchema,
      since: dateSchema,
      until: dateSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.since > value.until) {
        context.addIssue({
          code: 'custom',
          message: 'since must not follow until.',
          path: ['until'],
        });
      }
      const days =
        (Date.parse(`${value.until}T00:00:00Z`) - Date.parse(`${value.since}T00:00:00Z`)) /
          (24 * 60 * 60 * 1_000) +
        1;
      if (value.source === 'meta' && days > 90) {
        context.addIssue({
          code: 'custom',
          message: 'Meta synchronization is capped at 90 days.',
          path: ['since'],
        });
      }
    });
}

export const adminAiAnalyticsSyncSchema = analyticsSyncSchema(z.enum(['meta', 'searchConsole']));

/** Resolves deictic sync requests from the active canonical source workspace. */
export function adminAiAnalyticsSyncSchemaForContext(
  rawMessage: string,
  rawSection?: string | null,
) {
  const message = normalizedActionMessage(rawMessage);
  const section = normalizedActionMessage(rawSection ?? '').replace(/[-_]/g, '');
  if (message.includes('search console') || section === 'search') {
    return analyticsSyncSchema(z.literal('searchConsole'));
  }
  if (message.includes('meta') || section === 'acquisition') {
    return analyticsSyncSchema(z.literal('meta'));
  }
  return adminAiAnalyticsSyncSchema;
}

type AnalyticsSyncDependencies = {
  syncMeta: typeof syncMetaAdsInsights;
  syncSearch: typeof syncSearchConsole;
};

const defaultSyncDependencies: AnalyticsSyncDependencies = {
  syncMeta: syncMetaAdsInsights,
  syncSearch: syncSearchConsole,
};

export async function syncAdminAiAnalyticsSource(
  raw: z.input<typeof adminAiAnalyticsSyncSchema>,
  dependencies: AnalyticsSyncDependencies = defaultSyncDependencies,
) {
  const input = adminAiAnalyticsSyncSchema.parse(raw);
  if (input.source === 'meta') {
    const lookbackDays =
      Math.floor(
        (Date.parse(`${input.until}T00:00:00Z`) - Date.parse(`${input.since}T00:00:00Z`)) /
          (24 * 60 * 60 * 1_000),
      ) + 1;
    const result = await dependencies.syncMeta({
      since: input.since,
      until: input.until,
      lookbackDays,
      trigger: 'manual-profit-tracker',
    });
    return { kind: 'analytics_sync' as const, ...input, result };
  }
  const result = await dependencies.syncSearch({
    since: input.since,
    until: input.until,
    trigger: 'stats',
    inspectionLimit: 10,
  });
  return { kind: 'analytics_sync' as const, ...input, result };
}
