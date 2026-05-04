import { z } from 'zod';

export const orderStatusValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const deliveryTypeValues = [0, 1] as const;
export const DEGRADED_CAPTURE_VARIANT = 'degraded_capture' as const;

export const orderStatusSchema = z.union(
  orderStatusValues.map((value) => z.literal(value)) as [
    z.ZodLiteral<0>,
    z.ZodLiteral<1>,
    z.ZodLiteral<2>,
    z.ZodLiteral<3>,
    z.ZodLiteral<4>,
    z.ZodLiteral<5>,
    z.ZodLiteral<6>,
    z.ZodLiteral<7>,
    z.ZodLiteral<8>,
    z.ZodLiteral<9>,
    z.ZodLiteral<10>,
  ],
);
export const deliveryTypeSchema = z.union(deliveryTypeValues.map((value) => z.literal(value)) as [z.ZodLiteral<0>, z.ZodLiteral<1>]);
export const noAnswerCountSchema = z.number().int().min(0).max(99);

export const ORDER_STATUS_LABEL_KEYS = {
  0: 'notContacted',
  1: 'noAnswer',
  2: 'confirmed',
  3: 'dispatched',
  4: 'completed',
  5: 'delayed',
  6: 'cancelled',
  7: 'inDelivery',
  8: 'returned',
  9: 'failed',
  10: 'manualCompleted',
} as const satisfies Record<(typeof orderStatusValues)[number], string>;

export const DELIVERY_TYPE_LABEL_KEYS = {
  0: 'home',
  1: 'office',
} as const satisfies Record<(typeof deliveryTypeValues)[number], string>;

const nullableTrimmedString = (max: number) =>
  z.union([z.string(), z.null()]).transform((value) => {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, max);
  });

const optionalNullableTrimmedString = (max: number) =>
  z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, max);
  });

const nullableWilayaCode = z.union([z.number(), z.string(), z.null()]).transform((value) => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 58 ? value : null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 58 ? parsed : null;
});

export const orderPatchSchema = z
  .object({
    phoneNumber1: z.string().trim().min(1).max(50).optional(),
    note: nullableTrimmedString(500).optional(),
    confirmed: orderStatusSchema.optional(),
    noAnswerCount: noAnswerCountSchema.optional(),
    delivery: deliveryTypeSchema.optional(),
    state: nullableWilayaCode.optional(),
    city: nullableTrimmedString(120).optional(),
    homeAddress: nullableTrimmedString(300).optional(),
    cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const storefrontOrderCreateSchema = z.object({
  firstName: optionalNullableTrimmedString(80),
  lastName: optionalNullableTrimmedString(80),
  email: z.email().optional().nullable().or(z.literal('')).transform((value) => {
    if (value == null || value === '') {
      return null;
    }

    return value.trim().toLowerCase();
  }),
  phoneNumber1: z.string().trim().min(1).max(50),
  phoneNumber2: optionalNullableTrimmedString(50),
  cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  delivery: deliveryTypeSchema.default(0),
  state: nullableWilayaCode.optional().default(null),
  city: optionalNullableTrimmedString(120),
  homeAddress: optionalNullableTrimmedString(300),
  note: optionalNullableTrimmedString(500),
  visitId: optionalNullableTrimmedString(120),
  journeyId: optionalNullableTrimmedString(120),
  sessionId: optionalNullableTrimmedString(120),
});

export const storefrontOrderPatchSchema = z
  .object({
    firstName: optionalNullableTrimmedString(80).optional(),
    lastName: optionalNullableTrimmedString(80).optional(),
    email: z.email().optional().nullable().or(z.literal('')).transform((value) => {
      if (value == null || value === '') {
        return null;
      }

      return value.trim().toLowerCase();
    }).optional(),
    phoneNumber1: z.string().trim().min(1).max(50).optional(),
    phoneNumber2: optionalNullableTrimmedString(50).optional(),
    note: nullableTrimmedString(500).optional(),
    delivery: deliveryTypeSchema.optional(),
    state: nullableWilayaCode.optional(),
    city: nullableTrimmedString(120).optional(),
    homeAddress: nullableTrimmedString(300).optional(),
    cartProducts: z.array(z.string().trim().min(1).max(160)).min(1).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export type OrderPatch = z.infer<typeof orderPatchSchema>;
export type StorefrontOrderCreate = z.infer<typeof storefrontOrderCreateSchema>;
export type StorefrontOrderPatch = z.infer<typeof storefrontOrderPatchSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type DeliveryType = z.infer<typeof deliveryTypeSchema>;

export const orderSortKeyValues = ['confirmed', 'createdAt', 'fullName'] as const;
export const sortDirectionValues = ['asc', 'desc'] as const;

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().default(''),
  confirmed: z.union([orderStatusSchema, z.null()]).optional(),
  sortKey: z.enum(orderSortKeyValues).default('createdAt'),
  sortDirection: z.enum(sortDirectionValues).default('desc'),
});

export type OrderStatusHistoryRecord = {
  id: number;
  status: OrderStatus;
  noAnswerCount: number;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
};

export type OrderProductSummary = {
  productId: number | null;
  brandId?: number | null;
  slug?: string | null;
  rawValue: string;
  title: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string | null;
  missing: boolean;
};

export type OrderRecord = {
  id: number;
  publicToken?: string | null;
  ecotrackTrackingNumber?: string | null;
  variant?: string | null;
  isDegradedCapture?: boolean;
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email?: string | null;
  phoneNumber1: string;
  phoneNumber2: string | null;
  cartProducts: string[];
  orderProducts: OrderProductSummary[];
  delivery: DeliveryType;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
  subtotalOverride: number | null;
  productSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  note: string | null;
  confirmed: OrderStatus;
  noAnswerCount: number;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  hasStatusHistory: boolean;
  statusHistory: OrderStatusHistoryRecord[];
};

export type OrderSortKey = z.infer<typeof orderListQuerySchema>['sortKey'];
export type SortDirection = z.infer<typeof orderListQuerySchema>['sortDirection'];

export function parseNumericAmount(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const legacyDeliveryTypeMap = {
  home: 0,
  office: 1,
} as const;

const legacyOrderStatusMap = {
  pending: 0,
  nocon: 0,
  no2: 1,
  no3: 1,
  no4: 1,
  confirmed: 2,
  yes: 2,
  dispatched: 3,
  delivered: 4,
  complete: 4,
  delayed: 5,
  cancelled: 6,
  in_delivery: 7,
  'in delivery': 7,
  returned: 8,
  failed: 9,
  manual_completed: 10,
  'manual completed': 10,
} as const;

const legacyNoAnswerCountMap = {
  no2: 1,
  no3: 2,
  no4: 3,
} as const;

export function coerceOrderStatus(value: unknown): OrderStatus {
  if (typeof value === 'number' && orderStatusValues.includes(value as OrderStatus)) {
    return value as OrderStatus;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (trimmed === '') {
      return 0;
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isInteger(numeric) && orderStatusValues.includes(numeric as OrderStatus)) {
      return numeric as OrderStatus;
    }

    if (trimmed in legacyOrderStatusMap) {
      return legacyOrderStatusMap[trimmed as keyof typeof legacyOrderStatusMap];
    }
  }

  return 0;
}

export function coerceNoAnswerCount(status: OrderStatus, count: unknown, legacyStatus?: unknown) {
  if (status !== 1) {
    return 0;
  }

  if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
    return count;
  }

  if (typeof count === 'string') {
    const parsed = Number.parseInt(count, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (typeof legacyStatus === 'string') {
    const trimmed = legacyStatus.trim().toLowerCase();
    if (trimmed in legacyNoAnswerCountMap) {
      return legacyNoAnswerCountMap[trimmed as keyof typeof legacyNoAnswerCountMap];
    }
  }

  return 1;
}

export function isConfirmedLifecycleStatus(status: OrderStatus) {
  return status === 2 || status === 3 || status === 4 || status === 5 || status === 7 || status === 8 || status === 9 || status === 10;
}

export function getOrderStatusLabelKey(status: OrderStatus) {
  return ORDER_STATUS_LABEL_KEYS[status];
}

export function coerceDeliveryType(value: unknown): DeliveryType {
  if (typeof value === 'number' && deliveryTypeValues.includes(value as DeliveryType)) {
    return value as DeliveryType;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (trimmed === '') {
      return 0;
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isInteger(numeric) && deliveryTypeValues.includes(numeric as DeliveryType)) {
      return numeric as DeliveryType;
    }

    if (trimmed in legacyDeliveryTypeMap) {
      return legacyDeliveryTypeMap[trimmed as keyof typeof legacyDeliveryTypeMap];
    }
  }

  return 0;
}

export function getDeliveryTypeLabelKey(deliveryType: DeliveryType) {
  return DELIVERY_TYPE_LABEL_KEYS[deliveryType];
}

export function getOrderFullName(firstName: string | null | undefined, lastName: string | null | undefined, phoneNumber: string) {
  const fullName = [firstName, lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return fullName || phoneNumber;
}

export function parseOrderProductId(value: string) {
  const trimmed = value.trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

export function buildOrderProductSummaries(
  cartProducts: string[],
  resolveProduct?: (rawValue: string, productId: number | null) => Partial<Omit<OrderProductSummary, 'rawValue' | 'quantity' | 'lineTotal'>> | null | undefined,
) {
  const summaries = new Map<string, OrderProductSummary>();
  const orderedKeys: string[] = [];

  for (const rawProduct of cartProducts) {
    const rawValue = rawProduct.trim();

    if (!rawValue) {
      continue;
    }

    const productId = parseOrderProductId(rawValue);
    const resolved = resolveProduct?.(rawValue, productId) ?? null;
    const key = productId === null ? `raw:${rawValue}` : `product:${productId}`;

    if (!summaries.has(key)) {
      orderedKeys.push(key);
      summaries.set(key, {
        productId: resolved?.productId ?? productId,
        brandId: resolved?.brandId ?? null,
        ...(resolved?.slug !== undefined ? { slug: resolved.slug } : {}),
        rawValue,
        title: resolved?.title ?? rawValue,
        unitPrice: resolved?.unitPrice ?? 0,
        quantity: 0,
        lineTotal: 0,
        thumbnailUrl: resolved?.thumbnailUrl ?? null,
        missing: resolved?.missing ?? productId !== null,
      });
    }

    const current = summaries.get(key);

    if (!current) {
      continue;
    }

    current.quantity += 1;
    current.lineTotal = current.unitPrice * current.quantity;
  }

  return orderedKeys.map((key) => summaries.get(key)!);
}
