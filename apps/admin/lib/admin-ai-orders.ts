import { getDb } from '@bric/db/client';
import { z } from 'zod';

import {
  AdminOrderNotFoundError,
  AdminOrderStatusTransitionError,
  updateAdminOrder,
} from './admin-order-update';
import type { ActionActor } from './action-history';

const semanticOrderStatusSchema = z.enum([
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

const orderStatusValues = {
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

export const adminAiOrderStatusMutationSchema = z
  .object({
    items: z
      .array(
        z.object({
          orderId: z.number().int().positive(),
          status: semanticOrderStatusSchema,
          noAnswerCount: z.number().int().min(1).max(99).optional(),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((input, context) => {
    input.items.forEach((item, index) => {
      if (item.status === 'no_answer' && item.noAnswerCount === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'noAnswerCount is required when setting no_answer.',
          path: ['items', index, 'noAnswerCount'],
        });
      }
    });
  });

export async function updateAdminOrderStatuses(
  input: z.input<typeof adminAiOrderStatusMutationSchema>,
  actor?: ActionActor,
) {
  const values = adminAiOrderStatusMutationSchema.parse(input);
  const db = getDb();
  const items: Array<{
    orderId: number;
    previousStatus: number;
    status: number;
    statusLabel: keyof typeof orderStatusValues;
    noAnswerCount: number;
  }> = [];
  const skipped: Array<{
    orderId: number;
    reason: 'missing' | 'invalid_transition';
    from?: number;
    to?: number;
  }> = [];

  for (const item of values.items) {
    const status = orderStatusValues[item.status];
    try {
      const updated = await updateAdminOrder(
        db,
        item.orderId,
        {
          confirmed: status,
          ...(item.status === 'no_answer' ? { noAnswerCount: item.noAnswerCount } : {}),
        },
        actor,
      );
      const previousStatus =
        updated.statusHistory.length > 1
          ? updated.statusHistory.at(-2)!.status
          : (updated.statusHistory[0]?.status ?? updated.confirmed);
      items.push({
        orderId: item.orderId,
        previousStatus,
        status: updated.confirmed,
        statusLabel: item.status,
        noAnswerCount: updated.noAnswerCount,
      });
    } catch (error) {
      if (error instanceof AdminOrderNotFoundError) {
        skipped.push({ orderId: item.orderId, reason: 'missing' });
        continue;
      }
      if (error instanceof AdminOrderStatusTransitionError) {
        skipped.push({
          orderId: item.orderId,
          reason: 'invalid_transition',
          from: error.from,
          to: error.to,
        });
        continue;
      }
      throw error;
    }
  }

  return { ok: skipped.length === 0, items, skipped };
}
