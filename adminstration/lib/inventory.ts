import { z } from 'zod';

import { paginatedListMetaSchema, paginationQuerySchema } from './brands-categories';

export { paginationQuerySchema };

export const inventoryRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  inStock: z.boolean(),
  availabilityStatus: z.string(),
  inventoryQuantity: z.number().int().min(0),
  updatedAt: z.string(),
});

export const inventoryListResponseSchema = z.object({
  writable: z.boolean(),
  items: z.array(inventoryRowSchema),
  pagination: paginatedListMetaSchema,
});

export const inventoryBarcodeSchema = z.object({
  barcode: z.string().trim().max(120).nullable().transform((value) => {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }),
});

export const inventoryScanQuerySchema = z.object({
  query: z.string().trim().min(1).max(120),
});

export const inventoryApplyItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  source: z.object({
    type: z.enum(['shopping-list', 'order-scan']),
    orderIds: z.array(z.number().int().positive()).optional(),
  }).optional(),
});

export const inventoryApplyRequestSchema = z.object({
  mode: z.enum(['decrease', 'increase']),
  items: z.array(inventoryApplyItemSchema).min(1),
});

export const inventoryApplyResultItemSchema = z.object({
  productId: z.number().int().positive(),
  previousQuantity: z.number().int().min(0),
  nextQuantity: z.number().int().min(0),
});

export const inventoryApplySkippedItemSchema = z.object({
  productId: z.number().int().positive(),
  reason: z.string(),
});

export const inventoryApplyResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(inventoryApplyResultItemSchema),
  skipped: z.array(inventoryApplySkippedItemSchema),
});

export const inventoryOrderScanItemSchema = z.object({
  productId: z.number().int().positive().nullable(),
  title: z.string(),
  quantity: z.number().int().positive(),
  inventoryQuantity: z.number().int().min(0).nullable(),
  selectable: z.boolean(),
  reason: z.string().optional(),
});

export const inventoryScanBarcodeResponseSchema = z.object({
  kind: z.literal('barcode'),
  item: inventoryRowSchema,
});

export const inventoryScanOrderResponseSchema = z.object({
  kind: z.literal('order'),
  order: z.object({
    id: z.number().int().positive(),
    fullName: z.string(),
  }),
  items: z.array(inventoryOrderScanItemSchema),
});

export const inventoryScanNoneResponseSchema = z.object({
  kind: z.literal('none'),
});

export const inventoryScanResponseSchema = z.union([
  inventoryScanBarcodeResponseSchema,
  inventoryScanOrderResponseSchema,
  inventoryScanNoneResponseSchema,
]);

export type InventoryRow = z.infer<typeof inventoryRowSchema>;
export type InventoryListResponse = z.infer<typeof inventoryListResponseSchema>;
export type InventoryBarcodeInput = z.input<typeof inventoryBarcodeSchema>;
export type InventoryBarcodeValue = z.infer<typeof inventoryBarcodeSchema>;
export type InventoryScanQuery = z.infer<typeof inventoryScanQuerySchema>;
export type InventoryApplyItem = z.infer<typeof inventoryApplyItemSchema>;
export type InventoryApplyRequest = z.infer<typeof inventoryApplyRequestSchema>;
export type InventoryApplyResponse = z.infer<typeof inventoryApplyResponseSchema>;
export type InventoryOrderScanItem = z.infer<typeof inventoryOrderScanItemSchema>;
export type InventoryScanResponse = z.infer<typeof inventoryScanResponseSchema>;
