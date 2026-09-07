import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListSourceMode,
} from './contract';

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

  const ids = normalizeShoppingListOrderIds(orderIds);
  const legacyKey = `selected:${ids.join(',')}`;
  // Keep every previously accepted scope stable, including its stock credits.
  // Only cohorts above the former 500-order boundary need a bounded identity.
  return ids.length <= 500
    ? legacyKey
    : `selected:sha256:${bytesToHex(sha256(utf8ToBytes(legacyKey)))}`;
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
