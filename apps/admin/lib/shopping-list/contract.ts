import { z } from 'zod';

const shoppingListSourceModes = [
  'selected',
  'confirmed',
  'dispatched',
  'posted',
  'posted-and-confirmed',
] as const;

export const legacyShoppingListGeneratedAt = 'legacy';

export type ShoppingListSourceMode = (typeof shoppingListSourceModes)[number];

export type ShoppingListDraftItem = {
  draftId: string;
  productId: number | null;
  brandId: number | null;
  brandName: string;
  title: string;
  quantity: number;
  unitPrice?: number | null;
  purchasePrice?: number | null;
  thumbnailUrl: string | null;
  inventoryQuantity: number | null;
  inventoryDecreaseQuantity: number;
  inventoryShortageQuantity: number;
  inventoryAppliedQuantity: number;
  inventoryLedgerOnly?: boolean;
  inventoryManualAppliedQuantity?: number;
  inventoryOrderAppliedQuantity?: number;
  inventoryLegacyAppliedQuantity?: number;
  inventoryAllocationReview?: boolean;
  inventoryActionEligible: boolean;
  notes: string[];
  checked: boolean;
  isCustom: boolean;
  generatedAt: string;
};

export type ShoppingListOrderGroup = {
  orderId: number;
  customerName: string;
  note: string | null;
  generatedAt: string;
  products: Array<{
    title: string;
    quantity: number;
    unitPrice?: number | null;
    purchasePrice?: number | null;
    brandId: number | null;
    brandName: string;
    thumbnailUrl: string | null;
  }>;
};

export type ShoppingListDraftPayload = {
  sourceMode: ShoppingListSourceMode;
  orderIds: number[];
  title: string;
  generatedItems: ShoppingListDraftItem[];
  draftItems: ShoppingListDraftItem[];
  orders: ShoppingListOrderGroup[];
};

export type ShoppingListDraftRecord = ShoppingListDraftPayload & {
  scopeKey: string;
  revision: number;
  updatedAt: string;
  updatedByName: string | null;
};

export type ShoppingListDraftResponse = {
  draft: ShoppingListDraftRecord | null;
};

const shoppingListSourceModeSchema = z.enum(shoppingListSourceModes);

const nullableIdSchema = z.number().int().positive().nullable();

const generatedAtSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .optional()
  .default(legacyShoppingListGeneratedAt);

export const MAX_SHOPPING_LIST_ENTRIES = 10_000;

const shoppingListOrderIdsSchema = z
  .array(z.coerce.number().int().positive())
  .max(MAX_SHOPPING_LIST_ENTRIES)
  .default([]);

const shoppingListDraftItemSchema = z.object({
  draftId: z.string().trim().min(1).max(220),
  productId: nullableIdSchema,
  brandId: nullableIdSchema,
  brandName: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(9999),
  unitPrice: z.number().nonnegative().nullable().optional(),
  purchasePrice: z.number().nonnegative().nullable().optional(),
  thumbnailUrl: z
    .string()
    .trim()
    .url()
    .nullable()
    .or(z.literal('').transform(() => null)),
  inventoryQuantity: z.number().int().min(0).max(999999).nullable(),
  inventoryDecreaseQuantity: z.number().int().min(0).max(999999),
  inventoryShortageQuantity: z.number().int().min(0).max(999999),
  inventoryAppliedQuantity: z.number().int().min(0).max(999999),
  inventoryLedgerOnly: z.boolean().optional(),
  inventoryManualAppliedQuantity: z.number().int().nonnegative().optional(),
  inventoryOrderAppliedQuantity: z.number().int().nonnegative().optional(),
  inventoryLegacyAppliedQuantity: z.number().int().nonnegative().optional(),
  inventoryAllocationReview: z.boolean().optional(),
  inventoryActionEligible: z.boolean(),
  notes: z.array(z.string().trim().max(500)).max(100),
  checked: z.boolean(),
  isCustom: z.boolean(),
  generatedAt: generatedAtSchema,
});

const shoppingListOrderProductSchema = z.object({
  title: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(9999),
  unitPrice: z.number().nonnegative().nullable().optional(),
  purchasePrice: z.number().nonnegative().nullable().optional(),
  brandId: nullableIdSchema,
  brandName: z.string().trim().min(1).max(160),
  thumbnailUrl: z
    .string()
    .trim()
    .url()
    .nullable()
    .or(z.literal('').transform(() => null)),
});

const shoppingListOrderGroupSchema = z.object({
  orderId: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(220),
  note: z.string().trim().max(500).nullable(),
  generatedAt: generatedAtSchema,
  products: z.array(shoppingListOrderProductSchema).max(100),
});

export const shoppingListDraftPayloadSchema = z.object({
  sourceMode: shoppingListSourceModeSchema,
  orderIds: shoppingListOrderIdsSchema,
  title: z.string().trim().min(1).max(220),
  generatedItems: z.array(shoppingListDraftItemSchema).max(MAX_SHOPPING_LIST_ENTRIES),
  draftItems: z.array(shoppingListDraftItemSchema).max(MAX_SHOPPING_LIST_ENTRIES),
  orders: z.array(shoppingListOrderGroupSchema).max(MAX_SHOPPING_LIST_ENTRIES),
});

export const shoppingListDraftSaveRequestSchema = shoppingListDraftPayloadSchema.extend({
  revision: z.number().int().nonnegative().nullable(),
});

export const shoppingListDraftQuerySchema = z.object({
  sourceMode: shoppingListSourceModeSchema,
  orderIds: shoppingListOrderIdsSchema,
});

export const shoppingListDraftResetRequestSchema = shoppingListDraftQuerySchema.extend({
  revision: z.number().int().nonnegative(),
});
