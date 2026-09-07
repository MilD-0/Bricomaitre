import { z } from 'zod';

export const ORDER_STATUS = {
  NOT_CONTACTED: 0,
  NO_ANSWER: 1,
  CONFIRMED: 2,
  DISPATCHED: 3,
  COMPLETED: 4,
  DELAYED: 5,
  CANCELLED: 6,
  IN_DELIVERY: 7,
  RETURNED: 8,
  FAILED: 9,
  MANUAL_COMPLETED: 10,
  POSTED: 11,
} as const;

export const ORDER_STATUS_VALUES = [
  ORDER_STATUS.NOT_CONTACTED,
  ORDER_STATUS.NO_ANSWER,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.DELAYED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.MANUAL_COMPLETED,
  ORDER_STATUS.POSTED,
] as const;

const deliveryTypeValues = [0, 1] as const;

export const DEGRADED_CAPTURE_VARIANT = 'degraded_capture' as const;

export const CONFIRMED_LIFECYCLE_ORDER_STATUSES = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.DELAYED,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.MANUAL_COMPLETED,
  ORDER_STATUS.POSTED,
] as const;

export const orderStatusSchema = z.union(
  ORDER_STATUS_VALUES.map((value) => z.literal(value)) as [
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
    z.ZodLiteral<11>,
  ],
);

export const deliveryTypeSchema = z.union(
  deliveryTypeValues.map((value) => z.literal(value)) as [z.ZodLiteral<0>, z.ZodLiteral<1>],
);

export const ORDER_STATUS_LABEL_KEYS = {
  [ORDER_STATUS.NOT_CONTACTED]: 'notContacted',
  [ORDER_STATUS.NO_ANSWER]: 'noAnswer',
  [ORDER_STATUS.CONFIRMED]: 'confirmed',
  [ORDER_STATUS.DISPATCHED]: 'dispatched',
  [ORDER_STATUS.COMPLETED]: 'completed',
  [ORDER_STATUS.DELAYED]: 'delayed',
  [ORDER_STATUS.CANCELLED]: 'cancelled',
  [ORDER_STATUS.IN_DELIVERY]: 'inDelivery',
  [ORDER_STATUS.RETURNED]: 'returned',
  [ORDER_STATUS.FAILED]: 'failed',
  [ORDER_STATUS.MANUAL_COMPLETED]: 'manualCompleted',
  [ORDER_STATUS.POSTED]: 'posted',
} as const satisfies Record<(typeof ORDER_STATUS_VALUES)[number], string>;

const DELIVERY_TYPE_LABEL_KEYS = {
  0: 'home',
  1: 'office',
} as const satisfies Record<(typeof deliveryTypeValues)[number], string>;

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export type DeliveryType = z.infer<typeof deliveryTypeSchema>;

const legacyDeliveryTypeMap = {
  home: 0,
  office: 1,
} as const;

const legacyOrderStatusMap = {
  pending: ORDER_STATUS.NOT_CONTACTED,
  nocon: ORDER_STATUS.NOT_CONTACTED,
  no2: ORDER_STATUS.NO_ANSWER,
  no3: ORDER_STATUS.NO_ANSWER,
  no4: ORDER_STATUS.NO_ANSWER,
  confirmed: ORDER_STATUS.CONFIRMED,
  yes: ORDER_STATUS.CONFIRMED,
  dispatched: ORDER_STATUS.DISPATCHED,
  delivered: ORDER_STATUS.COMPLETED,
  complete: ORDER_STATUS.COMPLETED,
  delayed: ORDER_STATUS.DELAYED,
  cancelled: ORDER_STATUS.CANCELLED,
  in_delivery: ORDER_STATUS.IN_DELIVERY,
  'in delivery': ORDER_STATUS.IN_DELIVERY,
  returned: ORDER_STATUS.RETURNED,
  failed: ORDER_STATUS.FAILED,
  manual_completed: ORDER_STATUS.MANUAL_COMPLETED,
  'manual completed': ORDER_STATUS.MANUAL_COMPLETED,
  posted: ORDER_STATUS.POSTED,
} as const;

const legacyNoAnswerCountMap = {
  no2: 1,
  no3: 2,
  no4: 3,
} as const;

export function coerceOrderStatus(value: unknown): OrderStatus {
  if (typeof value === 'number' && ORDER_STATUS_VALUES.includes(value as OrderStatus)) {
    return value as OrderStatus;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (trimmed === '') {
      return ORDER_STATUS.NOT_CONTACTED;
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isInteger(numeric) && ORDER_STATUS_VALUES.includes(numeric as OrderStatus)) {
      return numeric as OrderStatus;
    }

    if (trimmed in legacyOrderStatusMap) {
      return legacyOrderStatusMap[trimmed as keyof typeof legacyOrderStatusMap];
    }
  }

  return ORDER_STATUS.NOT_CONTACTED;
}

export function coerceNoAnswerCount(status: OrderStatus, count: unknown, legacyStatus?: unknown) {
  if (status !== ORDER_STATUS.NO_ANSWER) {
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
  return CONFIRMED_LIFECYCLE_ORDER_STATUSES.includes(
    status as (typeof CONFIRMED_LIFECYCLE_ORDER_STATUSES)[number],
  );
}

const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [ORDER_STATUS.NOT_CONTACTED]: [
    ORDER_STATUS.NO_ANSWER,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.MANUAL_COMPLETED,
  ],
  [ORDER_STATUS.NO_ANSWER]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.MANUAL_COMPLETED,
  ],
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.DISPATCHED,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DELAYED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.IN_DELIVERY,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
    ORDER_STATUS.POSTED,
  ],
  [ORDER_STATUS.DISPATCHED]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DELAYED,
    ORDER_STATUS.IN_DELIVERY,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
  ],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.DELAYED]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.DISPATCHED,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.IN_DELIVERY,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
    ORDER_STATUS.POSTED,
  ],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.IN_DELIVERY]: [
    ORDER_STATUS.DISPATCHED,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DELAYED,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
  ],
  [ORDER_STATUS.RETURNED]: [],
  [ORDER_STATUS.FAILED]: [],
  [ORDER_STATUS.MANUAL_COMPLETED]: [],
  [ORDER_STATUS.POSTED]: [
    ORDER_STATUS.DISPATCHED,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DELAYED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.IN_DELIVERY,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
  ],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
  return from === to || ALLOWED_ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export class InvalidOrderStatusTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Order status cannot transition from ${from} to ${to} without a correction.`);
    this.name = 'InvalidOrderStatusTransitionError';
  }
}

export function assertOrderStatusTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransitionOrderStatus(from, to)) {
    throw new InvalidOrderStatusTransitionError(from, to);
  }
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
