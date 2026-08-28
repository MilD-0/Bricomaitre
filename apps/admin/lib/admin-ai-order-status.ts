import { z } from 'zod';

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
  not_contacted: 0,
  no_answer: 1,
  confirmed: 2,
  dispatched: 3,
  completed: 4,
  delayed: 5,
  cancelled: 6,
  in_delivery: 7,
  returned: 8,
  failed: 9,
  manual_completed: 10,
  posted: 11,
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
