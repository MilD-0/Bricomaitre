import { z } from 'zod';

import type { OrderRecord } from '@bric/storefront-core/order-domain';

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

const shoppingListOrderIdsSchema = z.array(z.coerce.number().int().positive()).max(500).default([]);

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
  generatedItems: z.array(shoppingListDraftItemSchema).max(500),
  draftItems: z.array(shoppingListDraftItemSchema).max(500),
  orders: z.array(shoppingListOrderGroupSchema).max(500),
});

export const shoppingListDraftSaveRequestSchema = shoppingListDraftPayloadSchema.extend({
  revision: z.number().int().nonnegative().nullable(),
});

export const shoppingListDraftQuerySchema = z.object({
  sourceMode: shoppingListSourceModeSchema,
  orderIds: shoppingListOrderIdsSchema,
});

export function normalizeShoppingListOrderIds(orderIds: readonly number[]) {
  return [...new Set(orderIds)].sort((left, right) => left - right);
}

export function buildShoppingListScopeKey(
  sourceMode: ShoppingListSourceMode,
  orderIds: readonly number[],
) {
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

export function buildShoppingListInventoryPreview(
  quantity: number,
  inventoryQuantity: number | null,
) {
  const available = Math.max(inventoryQuantity ?? 0, 0);
  const decreaseQuantity = Math.min(quantity, available);
  return {
    inventoryDecreaseQuantity: decreaseQuantity,
    inventoryShortageQuantity: Math.max(quantity - decreaseQuantity, 0),
    inventoryAppliedQuantity: 0,
    inventoryActionEligible: inventoryQuantity != null && decreaseQuantity > 0,
  };
}

export async function buildGeneratedShoppingListDraft(input: {
  orders: Array<Pick<OrderRecord, 'id' | 'fullName' | 'note' | 'orderProducts'>>;
  sourceMode: ShoppingListSourceMode;
  title: string;
  generatedAt?: string;
  resolveProductDetails: (
    productId: number,
  ) => Promise<{ inventoryQuantity: number; purchasePrice: number | null } | null>;
  resolveBrandName: (brandId: number | null) => Promise<string>;
}) {
  const orderIds = normalizeShoppingListOrderIds(input.orders.map((order) => order.id));
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const productDetailsCache = new Map<
    number,
    { inventoryQuantity: number; purchasePrice: number | null } | null
  >();
  const brandNameCache = new Map<number | null, string>();
  const productMap = new Map<string, ShoppingListDraftItem>();

  const productDetails = async (productId: number | null) => {
    if (productId == null) return null;
    if (!productDetailsCache.has(productId)) {
      productDetailsCache.set(productId, await input.resolveProductDetails(productId));
    }
    return productDetailsCache.get(productId) ?? null;
  };
  const brandName = async (brandId: number | null) => {
    if (!brandNameCache.has(brandId)) {
      brandNameCache.set(brandId, await input.resolveBrandName(brandId));
    }
    return brandNameCache.get(brandId)!;
  };

  for (const order of input.orders) {
    for (const product of order.orderProducts) {
      const key = `${product.brandId ?? 'none'}:${product.productId ?? product.rawValue}`;
      const existing = productMap.get(key);
      const note = order.note?.trim();
      if (existing) {
        existing.quantity += product.quantity;
        Object.assign(
          existing,
          buildShoppingListInventoryPreview(existing.quantity, existing.inventoryQuantity),
        );
        if (note && !existing.notes.includes(note)) existing.notes.push(note);
        continue;
      }

      const details = await productDetails(product.productId);
      const inventoryQuantity = details?.inventoryQuantity ?? null;
      productMap.set(key, {
        draftId: key,
        productId: product.productId ?? null,
        brandId: product.brandId ?? null,
        brandName: await brandName(product.brandId ?? null),
        title: product.title,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        purchasePrice: details?.purchasePrice ?? null,
        thumbnailUrl: product.thumbnailUrl,
        inventoryQuantity,
        ...buildShoppingListInventoryPreview(product.quantity, inventoryQuantity),
        notes: note ? [note] : [],
        checked: false,
        isCustom: false,
        generatedAt,
      });
    }
  }

  const orders: ShoppingListOrderGroup[] = await Promise.all(
    input.orders.map(async (order) => ({
      orderId: order.id,
      customerName: order.fullName,
      note: order.note,
      generatedAt,
      products: await Promise.all(
        order.orderProducts.map(async (product) => ({
          title: product.title,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          purchasePrice: (await productDetails(product.productId))?.purchasePrice ?? null,
          brandId: product.brandId ?? null,
          brandName: await brandName(product.brandId ?? null),
          thumbnailUrl: product.thumbnailUrl,
        })),
      ),
    })),
  );

  const generatedItems = [...productMap.values()].sort((left, right) => {
    const brandCompare = left.brandName.localeCompare(right.brandName);
    return brandCompare !== 0 ? brandCompare : left.title.localeCompare(right.title);
  });
  return shoppingListDraftPayloadSchema.parse({
    sourceMode: input.sourceMode,
    orderIds,
    title: input.title,
    generatedItems,
    draftItems: generatedItems.map((item) => ({ ...item, notes: [...item.notes] })),
    orders,
  });
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
