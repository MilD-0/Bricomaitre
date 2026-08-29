import { z } from 'zod';

import type { EcotrackShipmentListItem } from './ecotrack-admin-contracts';
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

function applySearch(items: EcotrackShipmentListItem[], search: string) {
  if (!search) return items;

  const normalized = search.toLowerCase();
  return items.filter(
    (item) =>
      item.trackingNumber.toLowerCase().includes(normalized) ||
      item.fullName.toLowerCase().includes(normalized) ||
      item.phoneNumber1.toLowerCase().includes(normalized) ||
      (item.phoneNumber2?.toLowerCase().includes(normalized) ?? false) ||
      (item.homeAddress?.toLowerCase().includes(normalized) ?? false) ||
      (item.city?.toLowerCase().includes(normalized) ?? false) ||
      (item.stateName?.toLowerCase().includes(normalized) ?? false) ||
      String(item.state ?? '').includes(normalized) ||
      item.status.currentStatus.toLowerCase().includes(normalized) ||
      item.orderProducts.some((product) => product.title.toLowerCase().includes(normalized)),
  );
}

function applySort(items: EcotrackShipmentListItem[], query: EcotrackShipmentListQuery) {
  return [...items].sort((left, right) => {
    for (const rule of query.sortRules) {
      const direction = rule.direction === 'asc' ? 1 : -1;
      let delta: number;

      if (rule.key === 'trackingNumber') {
        delta = left.trackingNumber.localeCompare(right.trackingNumber);
      } else if (rule.key === 'clientName') {
        delta = left.fullName.localeCompare(right.fullName);
      } else if (rule.key === 'currentStatus') {
        delta = left.status.currentStatus.localeCompare(right.status.currentStatus);
      } else if (rule.key === 'lastStatusSyncedAt') {
        delta =
          new Date(left.status.lastStatusSyncedAt ?? 0).getTime() -
          new Date(right.status.lastStatusSyncedAt ?? 0).getTime();
      } else {
        delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }

      if (delta !== 0) return delta * direction;
    }

    return right.orderId - left.orderId;
  });
}

export function applyEcotrackShipmentListQuery(
  items: EcotrackShipmentListItem[],
  query: EcotrackShipmentListQuery,
) {
  let filtered = items;

  if (query.status !== 'all') {
    filtered = filtered.filter((item) => item.status.currentStatus === query.status);
  }

  if (query.staleOnly) {
    filtered = filtered.filter(
      (item) => item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale,
    );
  }

  filtered = applySort(applySearch(filtered, query.search), query);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.limit;

  return {
    pageItems: filtered.slice(start, start + query.limit),
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
