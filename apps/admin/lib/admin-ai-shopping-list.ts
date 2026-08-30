import { inArray } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { brands, products } from '@bric/db/schema';

import type { ActionActor } from './action-history';
import { applyAdminInventoryBatch } from './admin-inventory-workflow';
import { loadOrderDetail, loadOrdersPageData } from './admin-orders-data';
import { ORDER_STATUS, parseNumericAmount, type OrderStatus } from './orders';
import {
  buildGeneratedShoppingListDraft,
  buildShoppingListInventoryPreview,
  buildShoppingListScopeKey,
  mergeShoppingListDraft,
  type ShoppingListDraftPayload,
  type ShoppingListSourceMode,
} from './shopping-list-drafts';
import {
  loadAdminShoppingListDraft,
  saveAdminShoppingListDraft,
} from './shopping-list-drafts.server';

const shoppingListSourceModeSchema = z.enum([
  'selected',
  'confirmed',
  'dispatched',
  'posted',
  'posted-and-confirmed',
]);

const adminAiShoppingListScopeShape = {
  sourceMode: shoppingListSourceModeSchema,
  orderIds: z.array(z.number().int().positive()).max(500),
  title: z.string().trim().min(1).max(220).nullable(),
};

function validateShoppingListScope(
  input: { sourceMode: ShoppingListSourceMode; orderIds: number[] },
  context: z.RefinementCtx,
) {
  if (input.sourceMode === 'selected' && input.orderIds.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['orderIds'],
      message: 'Selected shopping lists require exact inspected order IDs.',
    });
  }
  if (input.sourceMode !== 'selected' && input.orderIds.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['orderIds'],
      message: 'Status-cohort shopping lists must use an empty orderIds array.',
    });
  }
}

export const adminAiShoppingListScopeSchema = z
  .object(adminAiShoppingListScopeShape)
  .strict()
  .superRefine(validateShoppingListScope);

export const adminAiShoppingListInspectionSchema = z
  .object({
    ...adminAiShoppingListScopeShape,
    query: z.string().trim().max(200).default(''),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine(validateShoppingListScope);

export const adminAiShoppingListApplySchema = z
  .object({
    sourceMode: shoppingListSourceModeSchema,
    orderIds: z.array(z.number().int().positive()).max(500),
    selection: z.enum(['all', 'exact']),
    draftIds: z.array(z.string().trim().min(1).max(220)).max(500),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.sourceMode === 'selected' && input.orderIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderIds'],
        message: 'Exact order IDs are required.',
      });
    }
    if (input.sourceMode !== 'selected' && input.orderIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderIds'],
        message: 'Status cohorts use an empty orderIds array.',
      });
    }
    if (input.selection === 'exact' && input.draftIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['draftIds'],
        message: 'Exact selection requires at least one inspected draft ID.',
      });
    }
    if (input.selection === 'all' && input.draftIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['draftIds'],
        message: 'All selection uses an empty draftIds array.',
      });
    }
  });

const statusesBySource: Record<Exclude<ShoppingListSourceMode, 'selected'>, OrderStatus[]> = {
  confirmed: [ORDER_STATUS.CONFIRMED],
  dispatched: [ORDER_STATUS.DISPATCHED],
  posted: [ORDER_STATUS.POSTED],
  'posted-and-confirmed': [ORDER_STATUS.POSTED, ORDER_STATUS.CONFIRMED],
};

const defaultTitles: Record<ShoppingListSourceMode, string> = {
  selected: 'Selected orders shopping list',
  confirmed: 'Confirmed orders shopping list',
  dispatched: 'Dispatched orders shopping list',
  posted: 'Posted orders shopping list',
  'posted-and-confirmed': 'Posted and confirmed orders shopping list',
};

async function loadStatusOrders(status: OrderStatus) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await loadOrdersPageData({ page, limit: 100, inHouseStatus: status }, false);
    items.push(...result.items);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
}

async function loadShoppingListOrders(sourceMode: ShoppingListSourceMode, orderIds: number[]) {
  if (sourceMode === 'selected') {
    const uniqueIds = [...new Set(orderIds)];
    const loaded = await Promise.all(uniqueIds.map((orderId) => loadOrderDetail(orderId)));
    return {
      orders: loaded.flatMap((order) => (order ? [order] : [])),
      missingOrderIds: uniqueIds.filter((_, index) => loaded[index] == null),
    };
  }
  const batches = await Promise.all(statusesBySource[sourceMode].map(loadStatusOrders));
  const seen = new Set<number>();
  return {
    orders: batches.flat().filter((order) => {
      if (seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    }),
    missingOrderIds: [],
  };
}

function draftSummary(draft: ShoppingListDraftPayload) {
  return {
    orderCount: draft.orders.length,
    lineCount: draft.draftItems.length,
    totalUnits: draft.draftItems.reduce((total, item) => total + item.quantity, 0),
    inventoryCoveredUnits: draft.draftItems.reduce(
      (total, item) => total + item.inventoryDecreaseQuantity,
      0,
    ),
    shortageUnits: draft.draftItems.reduce(
      (total, item) => total + item.inventoryShortageQuantity,
      0,
    ),
    unmatchedLines: draft.draftItems.filter((item) => item.productId == null).length,
  };
}

function normalizedSearch(value: string | number | null) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function compactDraftLines(
  draft: ShoppingListDraftPayload,
  input: z.output<typeof adminAiShoppingListInspectionSchema>,
) {
  const query = normalizedSearch(input.query.trim());
  const filtered = draft.draftItems.filter(
    (item) =>
      !query ||
      [item.draftId, item.productId, item.brandName, item.title].some((value) =>
        normalizedSearch(value).includes(query),
      ),
  );
  const offset = (input.page - 1) * input.limit;
  return {
    lines: filtered.slice(offset, offset + input.limit).map((item) => ({
      draftId: item.draftId,
      productId: item.productId,
      brandName: item.brandName,
      title: item.title,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice ?? null,
      inventoryQuantity: item.inventoryQuantity,
      inventoryDecreaseQuantity: item.inventoryDecreaseQuantity,
      inventoryShortageQuantity: item.inventoryShortageQuantity,
      inventoryAppliedQuantity: item.inventoryAppliedQuantity,
      inventoryActionEligible: item.inventoryActionEligible,
      checked: item.checked,
      isCustom: item.isCustom,
      notes: item.notes.slice(0, 5),
      notesTruncated: item.notes.length > 5,
    })),
    linePagination: {
      page: input.page,
      limit: input.limit,
      totalItems: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / input.limit)),
      hasNextPage: offset + input.limit < filtered.length,
      hasPreviousPage: input.page > 1,
    },
  };
}

async function buildCurrentDraft(
  input: z.output<typeof adminAiShoppingListScopeSchema>,
  now = new Date(),
) {
  const db = getDb();
  const { orders, missingOrderIds } = await loadShoppingListOrders(
    input.sourceMode,
    input.orderIds,
  );
  const productIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.orderProducts.flatMap((product) =>
          product.productId == null ? [] : [product.productId],
        ),
      ),
    ),
  ];
  const brandIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.orderProducts.flatMap((product) =>
          product.brandId == null ? [] : [product.brandId],
        ),
      ),
    ),
  ];
  const [productRows, brandRows] = await Promise.all([
    productIds.length
      ? db
          .select({
            id: products.id,
            inventoryQuantity: products.inventoryQuantity,
            purchasePrice: products.purchasePrice,
          })
          .from(products)
          .where(inArray(products.id, productIds))
      : [],
    brandIds.length
      ? db
          .select({ id: brands.id, name: brands.name })
          .from(brands)
          .where(inArray(brands.id, brandIds))
      : [],
  ]);
  const productById = new Map(
    productRows.map((product) => [
      product.id,
      {
        inventoryQuantity: product.inventoryQuantity,
        purchasePrice:
          product.purchasePrice == null ? null : parseNumericAmount(product.purchasePrice),
      },
    ]),
  );
  const brandById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const generated = await buildGeneratedShoppingListDraft({
    orders,
    sourceMode: input.sourceMode,
    title: input.title ?? defaultTitles[input.sourceMode],
    generatedAt: now.toISOString(),
    resolveProductDetails: async (productId) => productById.get(productId) ?? null,
    resolveBrandName: async (brandId) =>
      brandId == null ? 'Unbranded' : (brandById.get(brandId) ?? `Brand #${brandId}`),
  });
  const existing = await loadAdminShoppingListDraft(db, generated);
  const draft = existing ? mergeShoppingListDraft(generated, existing) : generated;
  return { db, draft, existing, missingOrderIds };
}

export async function inspectAdminAiShoppingList(
  input: z.input<typeof adminAiShoppingListInspectionSchema>,
) {
  const values = adminAiShoppingListInspectionSchema.parse(input);
  const current = await buildCurrentDraft(values);
  return {
    kind: 'order_shopping_list_preview' as const,
    scopeKey: buildShoppingListScopeKey(values.sourceMode, values.orderIds),
    sourceMode: values.sourceMode,
    loadedSharedDraft: Boolean(current.existing),
    missingOrderIds: current.missingOrderIds,
    summary: draftSummary(current.draft),
    ...compactDraftLines(current.draft, values),
  };
}

export async function saveAdminAiShoppingList(
  input: z.input<typeof adminAiShoppingListScopeSchema>,
  actor?: ActionActor,
) {
  const values = adminAiShoppingListScopeSchema.parse(input);
  const current = await buildCurrentDraft(values);
  const draft = await saveAdminShoppingListDraft(current.db, current.draft, actor);
  return {
    ok: true as const,
    action: current.existing ? ('merged' as const) : ('created' as const),
    scopeKey: draft.scopeKey,
    missingOrderIds: current.missingOrderIds,
    summary: draftSummary(draft),
  };
}

export async function applyAdminAiShoppingListInventory(
  input: z.input<typeof adminAiShoppingListApplySchema>,
  actor?: ActionActor,
) {
  const values = adminAiShoppingListApplySchema.parse(input);
  const db = getDb();
  const draft = await loadAdminShoppingListDraft(db, values);
  if (!draft) return { ok: false as const, error: 'shopping_list_not_found' as const };
  const requestedIds = new Set(values.draftIds);
  const draftById = new Map(draft.draftItems.map((item) => [item.draftId, item]));
  const selectionSkipped: Array<{
    draftId: string;
    productId: number | null;
    reason:
      'missing_draft_line' | 'unmatched_product' | 'already_applied' | 'no_inventory_coverage';
  }> = [];
  const inspectedSelections =
    values.selection === 'exact'
      ? values.draftIds.map((draftId) => ({ draftId, item: draftById.get(draftId) }))
      : draft.draftItems.map((item) => ({ draftId: item.draftId, item }));
  for (const { draftId, item } of inspectedSelections) {
    if (!item) {
      selectionSkipped.push({ draftId, productId: null, reason: 'missing_draft_line' });
    } else if (item.productId == null) {
      selectionSkipped.push({ draftId, productId: null, reason: 'unmatched_product' });
    } else if (item.checked) {
      selectionSkipped.push({ draftId, productId: item.productId, reason: 'already_applied' });
    } else if (!item.inventoryActionEligible || item.inventoryDecreaseQuantity <= 0) {
      selectionSkipped.push({
        draftId,
        productId: item.productId,
        reason: 'no_inventory_coverage',
      });
    }
  }
  const candidates = draft.draftItems.filter(
    (item) =>
      item.productId != null &&
      !item.checked &&
      item.inventoryActionEligible &&
      item.inventoryDecreaseQuantity > 0 &&
      (values.selection === 'all' || requestedIds.has(item.draftId)),
  );
  if (candidates.length === 0) {
    return {
      ok: false as const,
      complete: false as const,
      error: 'no_inventory_changes' as const,
      selectionSkipped,
      applicationSummary: { appliedLineCount: 0, appliedUnits: 0, inventoryRejectedCount: 0 },
      summary: draftSummary(draft),
    };
  }

  const result = await applyAdminInventoryBatch(
    db,
    {
      mode: 'decrease',
      items: candidates.map((item) => ({
        productId: item.productId!,
        quantity: item.inventoryDecreaseQuantity,
        source: {
          type: 'shopping-list' as const,
          orderIds: draft.orders.map((order) => order.orderId),
        },
      })),
    },
    actor,
  );
  const appliedByProduct = new Map(result.items.map((item) => [item.productId, item]));
  const nextPayload: ShoppingListDraftPayload = {
    ...draft,
    draftItems: draft.draftItems.map((item) => {
      if (item.productId == null) return item;
      const applied = appliedByProduct.get(item.productId);
      if (!applied) return item;
      return {
        ...item,
        inventoryQuantity: applied.nextQuantity,
        ...buildShoppingListInventoryPreview(item.quantity, applied.nextQuantity),
        inventoryAppliedQuantity:
          item.inventoryAppliedQuantity + (applied.previousQuantity - applied.nextQuantity),
        checked: true,
      };
    }),
  };
  const saved = await saveAdminShoppingListDraft(db, nextPayload, actor);
  const appliedUnits = result.items.reduce(
    (total, item) => total + item.previousQuantity - item.nextQuantity,
    0,
  );
  return {
    ok: result.items.length > 0,
    complete: result.complete && (values.selection === 'all' || selectionSkipped.length === 0),
    scopeKey: saved.scopeKey,
    applied: result.items,
    skipped: result.skipped,
    selectionSkipped,
    applicationSummary: {
      appliedLineCount: result.items.length,
      appliedUnits,
      inventoryRejectedCount: result.skipped.length,
    },
    summary: draftSummary(saved),
  };
}
