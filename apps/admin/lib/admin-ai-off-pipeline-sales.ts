import { z } from 'zod';

import type { ActionActor } from './action-history';
import { reportingDateSchema } from './analytics/contract';
import { refreshAnalyticsFactsAfterMutation } from './analytics-facts';
import {
  createOffPipelineSale,
  deleteOffPipelineSale,
  listOffPipelineSales,
  offPipelineSaleCreateSchema,
  offPipelineSaleDeleteSchema,
  offPipelineSalePatchSchema,
  updateOffPipelineSale,
} from './off-pipeline-sales';

export const ADMIN_AI_OFF_PIPELINE_SALES_KNOWLEDGE = {
  meaning:
    'An off-pipeline sale is a completed sale that happened outside Bricomaitre Orders, Posting, and Shipments and is recorded only as realized financial contribution.',
  effects:
    'It contributes collected cash, fees, product cost, net revenue, and realized profit on its recognition date. It does not create or change orders, shipments, inventory, customers, fulfilment, returns, acquisition, or marketing conversion metrics.',
  evidence:
    'Use only the exact business date and amounts supplied or verified by the operator. Never infer missing fees, product cost, or amount from catalog prices, other sales, orders, or carrier data.',
  correction:
    'Correct the ledger entry itself. Do not create a synthetic order or shipment to represent it.',
} as const;

export const ADMIN_AI_OFF_PIPELINE_SALES_TOOL_DESCRIPTION = [
  ADMIN_AI_OFF_PIPELINE_SALES_KNOWLEDGE.meaning,
  ADMIN_AI_OFF_PIPELINE_SALES_KNOWLEDGE.effects,
  ADMIN_AI_OFF_PIPELINE_SALES_KNOWLEDGE.evidence,
].join(' ');

export const adminAiOffPipelineSalesQuerySchema = z
  .object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
    search: z.string().trim().max(160).default(''),
    startDate: reportingDateSchema.optional(),
    endDate: reportingDateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
        path: ['startDate'],
      });
    }
  })
  .describe('List exact off-pipeline financial entries. Use a date range or search when supplied.');

const operationSchema = z.discriminatedUnion('action', [
  offPipelineSaleCreateSchema.safeExtend({ action: z.literal('create') }),
  z
    .object({
      action: z.literal('update'),
      id: z.number().int().positive(),
      requestId: z.uuid(),
      changes: offPipelineSalePatchSchema,
    })
    .strict(),
  offPipelineSaleDeleteSchema.safeExtend({ action: z.literal('delete') }),
]);

export const adminAiOffPipelineSalesMutationSchema = z
  .object({ operations: z.array(operationSchema).min(1).max(20) })
  .strict();

type Dependencies = {
  list: typeof listOffPipelineSales;
  create: typeof createOffPipelineSale;
  update: typeof updateOffPipelineSale;
  delete: typeof deleteOffPipelineSale;
  refreshFacts: typeof refreshAnalyticsFactsAfterMutation;
};

const defaultDependencies: Dependencies = {
  list: listOffPipelineSales,
  create: createOffPipelineSale,
  update: updateOffPipelineSale,
  delete: deleteOffPipelineSale,
  refreshFacts: refreshAnalyticsFactsAfterMutation,
};

export async function queryAdminAiOffPipelineSales(
  raw: z.input<typeof adminAiOffPipelineSalesQuerySchema>,
  dependencies: Pick<Dependencies, 'list'> = defaultDependencies,
) {
  return {
    kind: 'off_pipeline_sales' as const,
    boundary: ADMIN_AI_OFF_PIPELINE_SALES_KNOWLEDGE.effects,
    ...(await dependencies.list(adminAiOffPipelineSalesQuerySchema.parse(raw))),
  };
}

export async function manageAdminAiOffPipelineSales(
  raw: z.input<typeof adminAiOffPipelineSalesMutationSchema>,
  actor?: ActionActor,
  dependencies: Omit<Dependencies, 'list'> = defaultDependencies,
) {
  const { operations } = adminAiOffPipelineSalesMutationSchema.parse(raw);
  const results: Array<Record<string, unknown>> = [];
  let changedCount = 0;

  for (const [index, operation] of operations.entries()) {
    try {
      let result;
      if (operation.action === 'create') {
        result = await dependencies.create(
          {
            requestId: operation.requestId,
            reference: operation.reference,
            description: operation.description,
            recognizedOn: operation.recognizedOn,
            amountCollectedDzd: operation.amountCollectedDzd,
            feesDzd: operation.feesDzd,
            productCostDzd: operation.productCostDzd,
            note: operation.note,
          },
          actor,
        );
      } else if (operation.action === 'update') {
        result = await dependencies.update(
          { id: operation.id, requestId: operation.requestId, changes: operation.changes },
          actor,
        );
      } else {
        result = await dependencies.delete(
          { id: operation.id, requestId: operation.requestId },
          actor,
        );
      }
      if (result.status !== 'not_found' && !result.replayed) changedCount += 1;
      results.push({ index, action: operation.action, ...result });
    } catch (error) {
      results.push({
        index,
        action: operation.action,
        id: 'id' in operation ? operation.id : null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Off-pipeline sale mutation failed.',
      });
    }
  }

  if (changedCount > 0) await dependencies.refreshFacts();
  return {
    kind: 'off_pipeline_sales_mutation' as const,
    requestedCount: operations.length,
    changedCount,
    results,
  };
}
