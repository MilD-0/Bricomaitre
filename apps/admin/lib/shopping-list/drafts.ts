import type { OrderRecord } from '@bric/storefront-core/order-domain';
import {
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListOrderGroup,
  type ShoppingListSourceMode,
  legacyShoppingListGeneratedAt,
  shoppingListDraftPayloadSchema,
} from './contract';
import {
  buildShoppingListInventoryPreview,
  normalizeShoppingListOrderIds,
  reconcileShoppingListAllocations,
} from './inventory';

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
