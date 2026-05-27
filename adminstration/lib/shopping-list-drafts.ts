import { z } from 'zod';

export const shoppingListSourceModes = ['selected', 'confirmed', 'dispatched', 'posted', 'posted-and-confirmed'] as const;
export const legacyShoppingListGeneratedAt = 'legacy';

export type ShoppingListSourceMode = (typeof shoppingListSourceModes)[number];

export type ShoppingListDraftItem = {
  draftId: string;
  productId: number | null;
  brandId: number | null;
  brandName: string;
  title: string;
  quantity: number;
  thumbnailUrl: string | null;
  inventoryQuantity: number | null;
  inventoryDecreaseQuantity: number;
  inventoryShortageQuantity: number;
  inventoryAppliedQuantity: number;
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
  updatedAt: string;
  updatedByName: string | null;
};

export type ShoppingListDraftResponse = {
  draft: ShoppingListDraftRecord | null;
};

export const shoppingListSourceModeSchema = z.enum(shoppingListSourceModes);

const nullableIdSchema = z.number().int().positive().nullable();
const generatedAtSchema = z.string().trim().min(1).max(80).optional().default(legacyShoppingListGeneratedAt);

export const shoppingListOrderIdsSchema = z.array(z.coerce.number().int().positive()).max(500).default([]);

export const shoppingListDraftItemSchema = z.object({
  draftId: z.string().trim().min(1).max(220),
  productId: nullableIdSchema,
  brandId: nullableIdSchema,
  brandName: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(9999),
  thumbnailUrl: z.string().trim().url().nullable().or(z.literal('').transform(() => null)),
  inventoryQuantity: z.number().int().min(0).max(999999).nullable(),
  inventoryDecreaseQuantity: z.number().int().min(0).max(999999),
  inventoryShortageQuantity: z.number().int().min(0).max(999999),
  inventoryAppliedQuantity: z.number().int().min(0).max(999999),
  inventoryActionEligible: z.boolean(),
  notes: z.array(z.string().trim().max(500)).max(100),
  checked: z.boolean(),
  isCustom: z.boolean(),
  generatedAt: generatedAtSchema,
});

export const shoppingListOrderProductSchema = z.object({
  title: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(9999),
  brandId: nullableIdSchema,
  brandName: z.string().trim().min(1).max(160),
  thumbnailUrl: z.string().trim().url().nullable().or(z.literal('').transform(() => null)),
});

export const shoppingListOrderGroupSchema = z.object({
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
  generatedItems: z.array(shoppingListDraftItemSchema).max(500),
  draftItems: z.array(shoppingListDraftItemSchema).max(500),
  orders: z.array(shoppingListOrderGroupSchema).max(500),
});

export const shoppingListDraftQuerySchema = z.object({
  sourceMode: shoppingListSourceModeSchema,
  orderIds: shoppingListOrderIdsSchema,
});

export function normalizeShoppingListOrderIds(orderIds: readonly number[]) {
  return [...new Set(orderIds)].sort((left, right) => left - right);
}

export function buildShoppingListScopeKey(sourceMode: ShoppingListSourceMode, orderIds: readonly number[]) {
  if (sourceMode === 'confirmed') {
    return 'status:confirmed';
  }

  if (sourceMode === 'dispatched') {
    return 'status:dispatched';
  }

  if (sourceMode === 'posted') {
    return 'status:posted';
  }

  if (sourceMode === 'posted-and-confirmed') {
    return 'status:posted-and-confirmed';
  }

  return `selected:${normalizeShoppingListOrderIds(orderIds).join(',')}`;
}

function mergeUniqueById<T>(saved: T[], generated: T[], getId: (item: T) => string | number) {
  const seen = new Set(saved.map((item) => getId(item)));
  const merged = [...saved];

  for (const item of generated) {
    const id = getId(item);
    if (!seen.has(id)) {
      merged.push(item);
      seen.add(id);
    }
  }

  return merged;
}

function normalizeDraftItemGeneration(item: ShoppingListDraftItem) {
  return {
    ...item,
    generatedAt: item.generatedAt || legacyShoppingListGeneratedAt,
  };
}

function normalizeOrderGroupGeneration(order: ShoppingListOrderGroup) {
  return {
    ...order,
    generatedAt: order.generatedAt || legacyShoppingListGeneratedAt,
  };
}

export function mergeShoppingListDraft(
  generated: ShoppingListDraftPayload,
  saved: ShoppingListDraftPayload,
): ShoppingListDraftPayload {
  const savedDraftItems = saved.draftItems.map(normalizeDraftItemGeneration);
  const generatedDraftItems = generated.draftItems.map(normalizeDraftItemGeneration);

  return {
    ...saved,
    sourceMode: generated.sourceMode,
    orderIds: normalizeShoppingListOrderIds(generated.orderIds),
    title: generated.title,
    draftItems: mergeUniqueById(savedDraftItems, generatedDraftItems, (item) => item.draftId),
    generatedItems: generated.generatedItems.map(normalizeDraftItemGeneration),
    orders: mergeUniqueById(
      saved.orders.map(normalizeOrderGroupGeneration),
      generated.orders.map(normalizeOrderGroupGeneration),
      (order) => order.orderId,
    ),
  };
}
