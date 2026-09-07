import { z } from 'zod';
import { adminAiInHouseOrderStatusSchema } from '../admin-ai-order-status';

const daySchema = z.iso.date();

const sortBySchema = z.enum(['createdAt', 'customerName', 'inHouseStatus', 'totalAmount']);

const productGroupingSchema = z
  .object({
    dimension: z.literal('product'),
    sortBy: z.enum(['orderCount', 'units']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const dateScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('day'), date: daySchema }).strict(),
  z.object({ kind: z.literal('range'), from: daySchema, to: daySchema }).strict(),
  z.object({ kind: z.literal('since'), date: daySchema }).strict(),
  z.object({ kind: z.literal('through'), date: daySchema }).strict(),
]);

const statusHistoryFilterSchema = z
  .object({
    field: z.literal('in_house_status_history'),
    statuses: z.array(adminAiInHouseOrderStatusSchema).min(1).max(12),
    date: dateScopeSchema.optional(),
  })
  .strict();

const createdFilterSchema = z
  .object({
    field: z.literal('created_date'),
    date: dateScopeSchema,
  })
  .strict();

const orderFilterSchema = z.discriminatedUnion('field', [
  z
    .object({
      field: z.literal('current_in_house_status'),
      statuses: z.array(adminAiInHouseOrderStatusSchema).min(1).max(12),
    })
    .strict(),
  statusHistoryFilterSchema,
  z
    .object({
      field: z.literal('product'),
      productIds: z.array(z.number().int().positive()).min(1).max(100),
    })
    .strict(),
  createdFilterSchema,
  z
    .object({
      field: z.literal('ecotrack_link'),
      state: z.enum(['active', 'none']),
    })
    .strict(),
  z
    .object({
      field: z.literal('ecotrack_shipment_status'),
      statuses: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    })
    .strict(),
  z
    .object({
      field: z.literal('no_answer_count'),
      count: z.number().int().min(1).max(99),
    })
    .strict(),
]);

export const adminAiOrderQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    filters: z.array(orderFilterSchema).max(8).optional(),
    groupBy: productGroupingSchema.optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    sort: z
      .object({
        by: sortBySchema,
        direction: z.enum(['asc', 'desc']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.groupBy && value.sort) {
      context.addIssue({
        code: 'custom',
        message: 'Use groupBy.sortBy for grouped results; order-row sorting does not apply.',
        path: ['sort'],
      });
    }
    value.filters?.forEach((filter, index) => {
      if (
        (filter.field === 'created_date' || filter.field === 'in_house_status_history') &&
        filter.date?.kind === 'range' &&
        filter.date.from > filter.date.to
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Date range from must not be after to.',
          path: ['filters', index, 'date', 'from'],
        });
      }
    });
  });

export const adminAiOrderInspectionSchema = z
  .object({ orderIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

export const ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION =
  'Query local orders. Search matches order IDs, customer details, saved product titles, and current product names or SKUs, including Arabic names and unaccented French names. Ad-set names are not product identities; use product-ID filters after resolving the actual catalog product when needed. Add only useful filters; date scopes distinguish one day, a range, since, and through. Returns lightweight rows and an exact total. Optionally group the matched orders by all their captured products for exact order and unit counts. Use inspect_orders for exact order detail.';

export const ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION =
  'Read exact local orders with captured line selling prices, purchase costs and their sources, in-house status history, and stored active or deleted EcoTrack shipment summaries. Null captured costs are unknown, not current catalog costs. This does not refresh the carrier.';
