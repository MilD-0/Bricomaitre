import { z } from 'zod';

import { deliveryTypeSchema, orderStatusSchema } from '@bric/storefront-core/order-domain';
import { parseSortRuleStrings, type SortRule } from './multi-sort';

export {
  buildOrderProductSummaries,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  DEGRADED_CAPTURE_VARIANT,
  getDeliveryTypeLabelKey,
  getOrderFullName,
  getOrderStatusLabelKey,
  isConfirmedLifecycleStatus,
  isMongoObjectId,
  parseNumericAmount,
  parseOrderProductId,
} from '@bric/storefront-core/order-domain';
export type {
  DeliveryType,
  OrderProductSummary,
  OrderRecord,
  OrderStatus,
  OrderStatusHistoryRecord,
} from '@bric/storefront-core/order-domain';

const nullableTrimmedString = (max: number) =>
  z.union([z.string(), z.null()]).transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, max);
  });

const optionalPatchNullableTrimmedString = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });

const optionalPatchNullableWilayaCode = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return value;
    if (typeof value === 'number') {
      return Number.isInteger(value) && value >= 1 && value <= 58 ? value : null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 58 ? parsed : null;
  });

export const orderPatchSchema = z
  .object({
    firstName: optionalPatchNullableTrimmedString(80),
    lastName: optionalPatchNullableTrimmedString(80),
    phoneNumber1: z.string().trim().min(1).max(50).optional(),
    note: nullableTrimmedString(500).optional(),
    confirmed: orderStatusSchema.optional(),
    noAnswerCount: z.coerce.number().int().min(0).max(99).optional(),
    delivery: deliveryTypeSchema.optional(),
    state: optionalPatchNullableWilayaCode,
    city: nullableTrimmedString(120).optional(),
    homeAddress: nullableTrimmedString(300).optional(),
    cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided.',
  });

export type OrderPatch = z.infer<typeof orderPatchSchema>;

const orderSortKeyValues = ['confirmed', 'createdAt', 'fullName'] as const;
const sortDirectionValues = ['asc', 'desc'] as const;

export const orderListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().default(''),
    confirmed: z.union([orderStatusSchema, z.null()]).optional(),
    noAnswerCount: z.union([z.coerce.number().int().min(0).max(99), z.null()]).optional(),
    sort: z.array(z.string().trim()).optional().default([]),
    sortKey: z.enum(orderSortKeyValues).default('createdAt'),
    sortDirection: z.enum(sortDirectionValues).default('desc'),
  })
  .transform((value, ctx) => {
    const parsedSortRules = parseSortRuleStrings(value.sort, orderSortKeyValues);

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

export type OrderSortKey = z.infer<typeof orderListQuerySchema>['sortKey'];
export type OrderSortRule = SortRule<OrderSortKey>;
