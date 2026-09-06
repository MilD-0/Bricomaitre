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
  inventoryAppliedQuantity = 0,
) {
  const remaining = Math.max(quantity - inventoryAppliedQuantity, 0);
  const available = Math.max(inventoryQuantity ?? 0, 0);
  const decreaseQuantity = Math.min(remaining, available);
  return {
    inventoryDecreaseQuantity: decreaseQuantity,
    inventoryShortageQuantity: Math.max(remaining - decreaseQuantity, 0),
    inventoryAppliedQuantity,
    inventoryActionEligible: inventoryQuantity != null && decreaseQuantity > 0,
  };
}

export function reconcileShoppingListInventory(item: ShoppingListDraftItem): ShoppingListDraftItem {
  const preview = buildShoppingListInventoryPreview(
    item.quantity,
    item.inventoryQuantity,
    item.inventoryAppliedQuantity,
  );
  const decrease = Math.min(item.inventoryDecreaseQuantity, preview.inventoryDecreaseQuantity);
  return {
    ...item,
    inventoryDecreaseQuantity: decrease,
    inventoryShortageQuantity: Math.max(
      item.quantity - item.inventoryAppliedQuantity - decrease,
      0,
    ),
    inventoryActionEligible: item.productId != null && preview.inventoryActionEligible,
  };
}

// generatedItems keeps the stock allocation ledger even when editable lines are
// removed. Credits belong to the product within this persisted shopping scope.
export function reconcileShoppingListAllocations<T extends ShoppingListDraftPayload>(
  input: T,
  previous: Pick<ShoppingListDraftPayload, 'generatedItems' | 'draftItems'> = input,
): T {
  const applied = new Map<number, number>();
  const templates = new Map<number, ShoppingListDraftItem>();
  for (const item of previous.generatedItems) {
    if (item.productId == null) continue;
    applied.set(
      item.productId,
      Math.max(applied.get(item.productId) ?? 0, item.inventoryAppliedQuantity),
    );
    templates.set(item.productId, item);
  }
  const legacyApplied = new Map<number, number>();
  for (const item of previous.draftItems) {
    if (item.productId == null) continue;
    legacyApplied.set(
      item.productId,
      (legacyApplied.get(item.productId) ?? 0) + item.inventoryAppliedQuantity,
    );
    if (!templates.has(item.productId)) templates.set(item.productId, item);
  }
  for (const [id, quantity] of legacyApplied)
    applied.set(id, Math.max(applied.get(id) ?? 0, quantity));
  const generatedItems: ShoppingListDraftItem[] = input.generatedItems.map((item) => ({
    ...item,
    inventoryManualAppliedQuantity:
      item.productId == null
        ? 0
        : (templates.get(item.productId)?.inventoryManualAppliedQuantity ?? 0),
    inventoryOrderAppliedQuantity:
      item.productId == null
        ? 0
        : (templates.get(item.productId)?.inventoryOrderAppliedQuantity ?? 0),
    inventoryLegacyAppliedQuantity:
      item.productId == null
        ? 0
        : (templates.get(item.productId)?.inventoryLegacyAppliedQuantity ?? 0),
    inventoryAppliedQuantity: item.productId == null ? 0 : (applied.get(item.productId) ?? 0),
  }));
  const present = new Set(generatedItems.map((item) => item.productId));
  for (const [id, quantity] of applied) {
    if (quantity <= 0 || present.has(id)) continue;
    generatedItems.push({
      ...templates.get(id)!,
      inventoryAppliedQuantity: quantity,
      inventoryLedgerOnly: true,
    });
  }
  const remainingCredit = new Map(applied);
  const draftItems = input.draftItems.map((item) => {
    const credit = item.productId == null ? 0 : (remainingCredit.get(item.productId) ?? 0);
    const allocated = Math.min(item.quantity, credit);
    if (item.productId != null) remainingCredit.set(item.productId, credit - allocated);
    return reconcileShoppingListInventory({
      ...item,
      inventoryAppliedQuantity: allocated,
      // Only generatedItems carry server-managed counters. Editable lines cannot
      // introduce credit by supplying these fields in a save request.
      inventoryManualAppliedQuantity: undefined,
      inventoryOrderAppliedQuantity: undefined,
      inventoryLegacyAppliedQuantity: undefined,
      inventoryAllocationReview:
        item.productId != null && Boolean(templates.get(item.productId)?.inventoryAllocationReview),
    });
  });
  return { ...input, generatedItems, draftItems };
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

function shoppingListProductKey(item: ShoppingListDraftItem) {
  return item.productId == null ? `draft:${item.draftId}` : `product:${item.productId}`;
}

export function mergeShoppingListDraft(
  generated: ShoppingListDraftPayload,
  saved: ShoppingListDraftPayload,
): ShoppingListDraftPayload {
  const group = (items: ShoppingListDraftItem[]) => {
    const groups = new Map<string, ShoppingListDraftItem[]>();
    for (const item of items) {
      const key = shoppingListProductKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  };
  const prior = group(saved.generatedItems.filter((item) => !item.inventoryLedgerOnly));
  const fresh = group(generated.generatedItems);
  const editable = group(saved.draftItems);
  const total = (items: ShoppingListDraftItem[]) =>
    items.reduce((sum, item) => sum + item.quantity, 0);
  const draftItems: ShoppingListDraftItem[] = [];
  for (const key of new Set([...editable.keys(), ...fresh.keys()])) {
    const oldGenerated = prior.get(key) ?? [];
    const oldItems = editable.get(key) ?? [];
    const newGenerated = fresh.get(key) ?? [];
    // An explicitly removed product stays removed on Refresh. Reset is the
    // separate action that restores generated lines.
    if (oldGenerated.length && !oldItems.length) continue;
    const quantity = Math.max(total(newGenerated) + total(oldItems) - total(oldGenerated), 0);
    if (!quantity) continue;
    const items = (oldItems.length ? oldItems : newGenerated).map((item) => ({ ...item }));
    let change = quantity - total(items);
    if (change > 0) {
      items[0]!.quantity += change;
      items[0]!.checked = false;
    } else {
      for (const item of [...items].reverse()) {
        const removed = Math.min(item.quantity, -change);
        item.quantity -= removed;
        change += removed;
      }
    }
    for (const item of items) {
      if (!item.quantity) continue;
      const inventoryQuantity = newGenerated.length
        ? newGenerated[0]!.inventoryQuantity
        : item.inventoryQuantity;
      draftItems.push({
        ...item,
        isCustom: newGenerated.length ? item.isCustom : true,
        inventoryQuantity,
        // Refresh recomputes the proposal using current demand and availability.
        // The authoritative save will subtract this cohort's existing credits.
        ...buildShoppingListInventoryPreview(item.quantity, inventoryQuantity),
        generatedAt: item.generatedAt || legacyShoppingListGeneratedAt,
      });
    }
  }
  const currentIds = new Set(generated.orderIds);
  const removedOrders = shoppingListOrderIds(saved).some((id) => !currentIds.has(id));
  const previous = removedOrders
    ? {
        generatedItems: saved.generatedItems.map((item) => ({
          ...item,
          inventoryOrderAppliedQuantity: 0,
          inventoryAppliedQuantity:
            (item.inventoryManualAppliedQuantity ?? 0) + (item.inventoryLegacyAppliedQuantity ?? 0),
        })),
        draftItems: [],
      }
    : saved;
  return reconcileShoppingListAllocations(
    {
      ...saved,
      sourceMode: generated.sourceMode,
      orderIds: normalizeShoppingListOrderIds(generated.orderIds),
      title: generated.title,
      draftItems,
      generatedItems: generated.generatedItems,
      orders: generated.orders,
    },
    previous,
  );
}

function shoppingListOrderIds(draft: ShoppingListDraftPayload) {
  return [...draft.orderIds, ...draft.orders.map((order) => order.orderId)];
}
