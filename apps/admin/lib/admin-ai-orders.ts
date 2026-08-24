import { getDb } from '@bric/db/client';
import { z } from 'zod';

import {
  AdminOrderLifecycleNotFoundError,
  createAdminOrder,
  deleteAdminOrder,
} from './admin-order-lifecycle';
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

export const adminAiOrderCreateSchema = z
  .object({
    firstName: z.string().trim().max(80).nullable(),
    lastName: z.string().trim().max(80).nullable(),
    // Keep the provider-facing schema free of lookahead regexes. The canonical
    // storefront order schema still validates a supplied address before any
    // write occurs.
    email: z.string().trim().max(254).nullable(),
    phoneNumber1: z.string().trim().min(1).max(50),
    phoneNumber2: z.string().trim().max(50).nullable(),
    productIds: z.array(z.number().int().positive()).min(1).max(50),
    delivery: z.enum(['home', 'stop_desk']),
    wilayaId: z.number().int().min(1).max(58).nullable(),
    commune: z.string().trim().max(120).nullable(),
    homeAddress: z.string().trim().max(300).nullable(),
    note: z.string().trim().max(500).nullable(),
    promoCode: z.string().trim().max(120).nullable(),
  })
  .strict();

export const adminAiOrderDeleteSchema = z
  .object({ orderIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

const adminAiOrderDetailsChangesShape = {
  firstName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
  phoneNumber: z.string().trim().min(1).max(50).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  delivery: z.enum(['home', 'stop_desk']).optional(),
  wilayaId: z.number().int().min(1).max(58).nullable().optional(),
  commune: z.string().trim().max(120).nullable().optional(),
  homeAddress: z.string().trim().max(300).nullable().optional(),
  cartProductTokens: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
};

function detailChangesSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .strict()
    .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
      message: 'At least one order detail must be changed.',
    });
}

const adminAiOrderDetailsChangesSchema = detailChangesSchema(adminAiOrderDetailsChangesShape);

export const adminAiOrderDetailsMutationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            orderId: z.number().int().positive(),
            changes: adminAiOrderDetailsChangesSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

const adminAiOrderDetailOperationSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('firstName'), value: z.string().trim().max(80).nullable() }).strict(),
  z.object({ field: z.literal('lastName'), value: z.string().trim().max(80).nullable() }).strict(),
  z.object({ field: z.literal('phoneNumber'), value: z.string().trim().min(1).max(50) }).strict(),
  z.object({ field: z.literal('note'), value: z.string().trim().max(500).nullable() }).strict(),
  z.object({ field: z.literal('delivery'), value: z.enum(['home', 'stop_desk']) }).strict(),
  z
    .object({
      field: z.literal('wilayaId'),
      value: z.number().int().min(1).max(58).nullable(),
    })
    .strict(),
  z.object({ field: z.literal('commune'), value: z.string().trim().max(120).nullable() }).strict(),
  z
    .object({
      field: z.literal('homeAddress'),
      value: z.string().trim().max(300).nullable(),
    })
    .strict(),
  z
    .object({
      field: z.literal('cartProductTokens'),
      value: z.array(z.string().trim().min(1).max(160)).max(50),
    })
    .strict(),
]);

/**
 * The model-facing contract represents each patch as one explicit field/value
 * operation. Strict tool-call providers therefore cannot populate unrelated
 * nullable or empty fields while still supporting natural conversational
 * follow-ups that do not repeat the field names from the preceding turn.
 */
export const adminAiOrderDetailsToolSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            orderId: z.number().int().positive(),
            operations: z.array(adminAiOrderDetailOperationSchema).min(1).max(9),
          })
          .strict()
          .superRefine((item, context) => {
            const seen = new Set<string>();
            item.operations.forEach((operation, index) => {
              if (seen.has(operation.field)) {
                context.addIssue({
                  code: 'custom',
                  message: `Order detail field ${operation.field} can only be changed once.`,
                  path: ['operations', index, 'field'],
                });
              }
              seen.add(operation.field);
            });
          }),
      )
      .min(1)
      .max(20),
  })
  .strict();

export function adminAiOrderDetailsMutationFromTool(
  input: z.input<typeof adminAiOrderDetailsToolSchema>,
) {
  const values = adminAiOrderDetailsToolSchema.parse(input);
  return adminAiOrderDetailsMutationSchema.parse({
    items: values.items.map((item) => ({
      orderId: item.orderId,
      changes: Object.fromEntries(
        item.operations.map((operation) => [operation.field, operation.value]),
      ),
    })),
  });
}

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

export async function createAdminAiOrder(
  input: z.input<typeof adminAiOrderCreateSchema>,
  actor?: ActionActor,
) {
  const values = adminAiOrderCreateSchema.parse(input);
  const result = await createAdminOrder(
    getDb(),
    {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phoneNumber1: values.phoneNumber1,
      phoneNumber2: values.phoneNumber2,
      cartProducts: values.productIds.map(String),
      delivery: values.delivery === 'home' ? 0 : 1,
      state: values.wilayaId,
      city: values.commune,
      homeAddress: values.delivery === 'home' ? values.homeAddress : null,
      note: values.note,
      promoCode: values.promoCode,
      visitId: null,
      journeyId: null,
      sessionId: null,
    },
    actor,
  );
  return { ok: true as const, ...result };
}

export async function deleteAdminAiOrders(
  input: z.input<typeof adminAiOrderDeleteSchema>,
  actor?: ActionActor,
) {
  const values = adminAiOrderDeleteSchema.parse(input);
  const deleted = [];
  const failed = [];
  const db = getDb();
  for (const orderId of [...new Set(values.orderIds)]) {
    try {
      const item = await deleteAdminOrder(db, orderId, actor);
      deleted.push({
        ...item,
        externalShipmentMayRemain: Boolean(item.ecotrackTrackingNumber),
      });
    } catch (error) {
      failed.push({
        orderId,
        code:
          error instanceof AdminOrderLifecycleNotFoundError
            ? 'order_not_found'
            : error instanceof Error
              ? error.name
              : 'OrderDeletionError',
        message: error instanceof Error ? error.message : 'Unable to delete order.',
      });
    }
  }
  return {
    ok: failed.length === 0,
    requestedCount: values.orderIds.length,
    deletedCount: deleted.length,
    failedCount: failed.length,
    deleted,
    failed,
  };
}

export async function updateAdminOrderDetails(
  input: z.input<typeof adminAiOrderDetailsMutationSchema>,
  actor?: ActionActor,
) {
  const values = adminAiOrderDetailsMutationSchema.parse(input);
  const db = getDb();
  const items = [];
  const failed: Array<{ orderId: number; error: string }> = [];

  for (const item of values.items) {
    const changes = item.changes;
    try {
      const updated = await updateAdminOrder(
        db,
        item.orderId,
        {
          firstName: changes.firstName,
          lastName: changes.lastName,
          phoneNumber1: changes.phoneNumber,
          note: changes.note,
          delivery:
            changes.delivery === undefined ? undefined : changes.delivery === 'home' ? 0 : 1,
          state: changes.wilayaId,
          city: changes.commune,
          homeAddress: changes.homeAddress,
          cartProducts: changes.cartProductTokens,
        },
        actor,
      );
      items.push(updated);
    } catch (error) {
      failed.push({
        orderId: item.orderId,
        error: error instanceof Error ? error.message : 'Order update failed.',
      });
    }
  }

  return {
    ok: failed.length === 0,
    updatedCount: items.length,
    items,
    failed,
  };
}

export async function updateAdminOrderDetailsFromTool(
  input: z.input<typeof adminAiOrderDetailsToolSchema>,
  actor?: ActionActor,
) {
  return updateAdminOrderDetails(adminAiOrderDetailsMutationFromTool(input), actor);
}
