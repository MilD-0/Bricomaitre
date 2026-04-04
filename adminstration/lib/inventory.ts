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

export type InventoryRow = z.infer<typeof inventoryRowSchema>;
export type InventoryListResponse = z.infer<typeof inventoryListResponseSchema>;
export type InventoryBarcodeInput = z.input<typeof inventoryBarcodeSchema>;
export type InventoryBarcodeValue = z.infer<typeof inventoryBarcodeSchema>;
