import { getDb } from '@bric/db/client';
import { z } from 'zod';

import type { ActionActor } from './action-history';
import {
  AdminInventoryNotFoundError,
  applyAdminInventoryBatch,
  inspectAdminInventoryScan,
  updateAdminInventoryProduct,
} from './admin-inventory-workflow';

export const adminAiInventoryAdjustmentSchema = z.object({
  mode: z
    .enum(['increase', 'decrease'])
    .describe('Direction of the requested stock change; this is not an absolute stock setter.'),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().describe('Exact product ID resolved by inspection.'),
        quantity: z
          .number()
          .int()
          .positive()
          .max(1_000_000)
          .describe(
            'Positive delta to add or subtract, never the desired final inventory quantity.',
          ),
      }),
    )
    .min(1)
    .max(100),
});

const adminAiInventoryStateOperationSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('barcode'), value: z.string().trim().max(120).nullable() }).strict(),
  z.object({ field: z.literal('inStock'), value: z.boolean() }).strict(),
]);

export const adminAiInventoryStateSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            operations: z.array(adminAiInventoryStateOperationSchema).min(1).max(2),
          })
          .strict()
          .superRefine((item, context) => {
            if (
              new Set(item.operations.map((operation) => operation.field)).size !==
              item.operations.length
            ) {
              context.addIssue({
                code: 'custom',
                path: ['operations'],
                message: 'Each inventory state field can only be changed once.',
              });
            }
          }),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const adminAiInventoryScanSchema = z
  .object({ query: z.string().trim().min(1).max(120) })
  .strict();

export const adminAiInventoryReceiptSchema = z
  .object({
    source: z.enum(['order_scan', 'barcode_scan']),
    orderId: z.number().int().positive().nullable(),
    items: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            quantity: z.number().int().positive().max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.source === 'order_scan' && input.orderId == null) {
      context.addIssue({
        code: 'custom',
        path: ['orderId'],
        message: 'An exact inspected order ID is required for an order scan.',
      });
    }
    if (input.source === 'barcode_scan' && input.orderId != null) {
      context.addIssue({
        code: 'custom',
        path: ['orderId'],
        message: 'A barcode scan cannot be attributed to an order ID.',
      });
    }
  });

export async function scanAdminInventory(input: z.input<typeof adminAiInventoryScanSchema>) {
  return inspectAdminInventoryScan(getDb(), adminAiInventoryScanSchema.parse(input));
}

export async function receiveAdminInventory(
  input: z.input<typeof adminAiInventoryReceiptSchema>,
  actor?: ActionActor,
) {
  const values = adminAiInventoryReceiptSchema.parse(input);
  return applyAdminInventoryBatch(
    getDb(),
    {
      requestId: crypto.randomUUID(),
      mode: 'increase',
      items: values.items.map((item) => ({
        ...item,
        source: {
          type:
            values.source === 'barcode_scan' ? ('barcode-scan' as const) : ('order-scan' as const),
          ...(values.orderId == null ? {} : { orderIds: [values.orderId] }),
        },
      })),
    },
    actor,
  );
}

export async function updateAdminInventoryState(
  input: z.input<typeof adminAiInventoryStateSchema>,
  actor?: ActionActor,
) {
  const values = adminAiInventoryStateSchema.parse(input);
  const items = [];
  const failed = [];
  const db = getDb();

  for (const requested of values.items) {
    const changes = Object.fromEntries(
      requested.operations.map((operation) => [operation.field, operation.value]),
    );
    try {
      const item = await updateAdminInventoryProduct(db, requested.productId, changes, actor);
      items.push({
        productId: requested.productId,
        fields: requested.operations.map((operation) => operation.field),
        item,
      });
    } catch (error) {
      failed.push({
        productId: requested.productId,
        fields: requested.operations.map((operation) => operation.field),
        code:
          error instanceof AdminInventoryNotFoundError
            ? 'product_not_found'
            : error instanceof Error
              ? error.name
              : 'InventoryUpdateError',
        message: error instanceof Error ? error.message : 'Unable to update inventory state.',
      });
    }
  }

  return { ok: failed.length === 0, updatedCount: items.length, items, failed };
}

export async function adjustAdminInventory(
  input: z.input<typeof adminAiInventoryAdjustmentSchema>,
  actor?: ActionActor,
) {
  const values = adminAiInventoryAdjustmentSchema.parse(input);
  const result = await applyAdminInventoryBatch(
    getDb(),
    { ...values, requestId: crypto.randomUUID() },
    actor,
  );
  return { ok: result.complete, items: result.items, skipped: result.skipped };
}
