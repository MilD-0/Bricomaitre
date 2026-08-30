import { z } from 'zod';

import { ORDER_STATUS } from './orders';

export const adminAiInHouseOrderStatusSchema = z.enum([
  'not_contacted',
  'no_answer',
  'confirmed',
  'dispatched',
  'completed',
  'delayed',
  'cancelled',
  'in_delivery',
  'returned',
  'failed',
  'manual_completed',
  'posted',
]);

export const ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES = {
  not_contacted: ORDER_STATUS.NOT_CONTACTED,
  no_answer: ORDER_STATUS.NO_ANSWER,
  confirmed: ORDER_STATUS.CONFIRMED,
  dispatched: ORDER_STATUS.DISPATCHED,
  completed: ORDER_STATUS.COMPLETED,
  delayed: ORDER_STATUS.DELAYED,
  cancelled: ORDER_STATUS.CANCELLED,
  in_delivery: ORDER_STATUS.IN_DELIVERY,
  returned: ORDER_STATUS.RETURNED,
  failed: ORDER_STATUS.FAILED,
  manual_completed: ORDER_STATUS.MANUAL_COMPLETED,
  posted: ORDER_STATUS.POSTED,
} as const;

export type AdminAiInHouseOrderStatus = keyof typeof ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES;

const statusNameByValue = new Map<number, AdminAiInHouseOrderStatus>(
  Object.entries(ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES).map(([name, value]) => [
    value,
    name as AdminAiInHouseOrderStatus,
  ]),
);

export function adminAiInHouseOrderStatus(value: number, noAnswerCount = 0) {
  return {
    name: statusNameByValue.get(value) ?? 'not_contacted',
    value,
    ...(value === ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES.no_answer ? { noAnswerCount } : {}),
  };
}
