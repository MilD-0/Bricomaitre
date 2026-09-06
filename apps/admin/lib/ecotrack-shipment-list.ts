import { z } from 'zod';

import { parseSortRuleStrings } from './multi-sort';

const sortKeyValues = [
  'createdAt',
  'trackingNumber',
  'clientName',
  'currentStatus',
  'lastStatusSyncedAt',
] as const;
const sortKeySchema = z.enum(sortKeyValues);
const sortDirectionSchema = z.enum(['asc', 'desc']);

export type EcotrackShipmentListQueryInput = {
  page?: string | number | undefined;
  limit?: string | number | undefined;
  search?: string | undefined;
  status?: string | undefined;
  staleOnly?: string | boolean | undefined;
  sort?: string[] | undefined;
  sortKey?: string | undefined;
  sortDirection?: string | undefined;
};

export const ecotrackShipmentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().default(''),
    status: z.string().trim().default('all'),
    staleOnly: z
      .union([z.boolean(), z.string(), z.undefined()])
      .transform((value) => value === true || value === 'true')
      .default(false),
    sort: z.array(z.string().trim()).optional().default([]),
    sortKey: sortKeySchema.default('createdAt'),
    sortDirection: sortDirectionSchema.default('desc'),
  })
  .transform((value, ctx) => {
    const parsedSortRules = parseSortRuleStrings(value.sort, sortKeyValues);

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

export type EcotrackShipmentListQuery = z.infer<typeof ecotrackShipmentListQuerySchema>;

export function parseEcotrackShipmentListQuery(input: EcotrackShipmentListQueryInput) {
  return ecotrackShipmentListQuerySchema.parse(input);
}
