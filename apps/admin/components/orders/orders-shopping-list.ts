import { requestJson as request } from '../../lib/admin-api';
import { parseNumericAmount, type OrderRecord } from '../../lib/orders';
import {
  buildGeneratedShoppingListDraft,
  buildShoppingListInventoryPreview,
  buildShoppingListScopeKey,
  mergeShoppingListDraft,
  normalizeShoppingListOrderIds,
  reconcileShoppingListInventory,
  type ShoppingListDraftItem,
  type ShoppingListDraftRecord,
  type ShoppingListDraftResponse,
  type ShoppingListSourceMode,
} from '../../lib/shopping-list-drafts';
import { groupShoppingListGenerations, type ShoppingListState } from './orders-workflow-model';

type ShoppingListDraftSaveResponse = { ok: true; draft: ShoppingListDraftRecord };

function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}
export type BrandLookupResponse = { id: number; name: string };
export type ProductLookupResponse = {
  item: {
    id: number;
    inventoryQuantity: number;
    brandId?: number | null;
    slug?: string | null;
    title?: string;
    price?: number | string | null;
    purchasePrice?: number | string | null;
    images?: string[];
  };
};

export function buildShoppingListDraftRequest(
  sourceMode: ShoppingListSourceMode,
  orderIds: readonly number[],
  revision?: number,
): { url: string; init?: RequestInit } {
  const ids = normalizeShoppingListOrderIds(orderIds);
  const params = new URLSearchParams({ sourceMode });
  if (sourceMode === 'selected') {
    ids.forEach((orderId) => params.append('orderIds', String(orderId)));
  }
  if (revision !== undefined) params.set('revision', String(revision));
  const url = `/api/orders/shopping-list-draft?${params.toString()}`;
  // Large cohorts remain explicit in a body; no unsaved selection depends on
  // a hash-only URL or a separately persisted recipe. Leave room for proxies.
  if (sourceMode === 'selected' && (ids.length > 500 || url.length > 7000)) {
    return {
      url: '/api/orders/shopping-list-draft',
      init: {
        method: revision === undefined ? 'POST' : 'DELETE',
        body: JSON.stringify({ sourceMode, orderIds: ids, revision }),
      },
    };
  }
  return { url, init: revision === undefined ? undefined : { method: 'DELETE' } };
}

export async function fetchShoppingListDraft(
  sourceMode: ShoppingListSourceMode,
  orderIds: readonly number[],
) {
  const { url, init } = buildShoppingListDraftRequest(sourceMode, orderIds);
  return request<ShoppingListDraftResponse>(url, init);
}

export async function resetShoppingListDraft(
  state: NonNullable<ShoppingListState> & { revision: number },
) {
  const { url, init } = buildShoppingListDraftRequest(
    state.sourceMode,
    state.orderIds,
    state.revision,
  );
  return request<ShoppingListDraftSaveResponse>(url, init);
}

export async function saveShoppingListDraft(state: NonNullable<ShoppingListState>) {
  const payload = {
    sourceMode: state.sourceMode,
    orderIds: state.orderIds,
    title: state.title,
    generatedItems: state.generatedItems,
    draftItems: state.draftItems,
    orders: state.orders,
    revision: state.revision,
  };

  return request<ShoppingListDraftSaveResponse>('/api/orders/shopping-list-draft', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function buildShoppingListStateFromDraft(
  draft: ShoppingListDraftRecord,
  title?: string,
): NonNullable<ShoppingListState> {
  return {
    sourceMode: draft.sourceMode,
    orderIds: normalizeShoppingListOrderIds(draft.orderIds),
    scopeKey: draft.scopeKey,
    revision: draft.revision,
    title: title ?? draft.title,
    generatedItems: draft.generatedItems,
    draftItems: draft.draftItems.map(reconcileShoppingListInventory),
    orders: draft.orders,
    search: '',
    updatedAt: draft.updatedAt,
    updatedByName: draft.updatedByName,
  };
}

export function recalculateShoppingListInventory(
  item: ShoppingListDraftItem,
  overrides?: Partial<
    Pick<ShoppingListDraftItem, 'quantity' | 'inventoryQuantity' | 'inventoryAppliedQuantity'>
  >,
) {
  const quantity = overrides?.quantity ?? item.quantity;
  const inventoryQuantity = overrides?.inventoryQuantity ?? item.inventoryQuantity;
  const inventoryAppliedQuantity =
    overrides?.inventoryAppliedQuantity ?? item.inventoryAppliedQuantity;
  const nextPreview = buildShoppingListInventoryPreview(
    quantity,
    inventoryQuantity,
    inventoryAppliedQuantity,
  );

  return {
    ...item,
    quantity,
    inventoryQuantity,
    inventoryDecreaseQuantity: nextPreview.inventoryDecreaseQuantity,
    inventoryShortageQuantity: nextPreview.inventoryShortageQuantity,
    inventoryActionEligible: item.productId != null && nextPreview.inventoryActionEligible,
    inventoryAppliedQuantity,
  };
}

async function buildShoppingListState(
  orders: OrderRecord[],
  sourceMode: ShoppingListSourceMode,
  title: string,
) {
  const productIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.orderProducts.flatMap((item) => (item.productId == null ? [] : [item.productId])),
      ),
    ),
  ];
  const brandIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.orderProducts.flatMap((item) => (item.brandId == null ? [] : [item.brandId])),
      ),
    ),
  ];
  const details = await request<{
    products: Array<{ id: number; inventoryQuantity: number; purchasePrice: string | null }>;
    brands: Array<{ id: number; name: string }>;
  }>('/api/orders/shopping-list-details', {
    method: 'POST',
    body: JSON.stringify({ productIds, brandIds }),
  });
  const productById = new Map(details.products.map((item) => [item.id, item]));
  const brandById = new Map(details.brands.map((item) => [item.id, item.name]));
  const generated = await buildGeneratedShoppingListDraft({
    orders,
    sourceMode,
    title,
    resolveProductDetails: async (productId) => {
      const product = productById.get(productId);
      return product
        ? {
            inventoryQuantity: product.inventoryQuantity,
            purchasePrice:
              product.purchasePrice == null ? null : parseNumericAmount(product.purchasePrice),
          }
        : null;
    },
    resolveBrandName: async (brandId) =>
      brandId == null ? 'Unbranded' : (brandById.get(brandId) ?? 'Unbranded'),
  });

  return {
    ...generated,
    scopeKey: buildShoppingListScopeKey(sourceMode, generated.orderIds),
    revision: null,
    search: '',
    updatedAt: null,
    updatedByName: null,
  };
}

export async function buildMergedShoppingListState(
  orders: OrderRecord[],
  sourceMode: ShoppingListSourceMode,
  title: string,
) {
  const generatedState = await buildShoppingListState(orders, sourceMode, title);
  const response = await fetchShoppingListDraft(sourceMode, generatedState.orderIds);

  if (!response.draft) {
    return { state: generatedState, loadedSharedDraft: false };
  }

  const merged = mergeShoppingListDraft(generatedState, response.draft);
  return {
    state: {
      ...merged,
      scopeKey: response.draft.scopeKey,
      revision: response.draft.revision,
      search: '',
      updatedAt: response.draft.updatedAt,
      updatedByName: response.draft.updatedByName,
    },
    loadedSharedDraft: true,
  };
}

export function buildShoppingListPrintHtml(
  state: NonNullable<ShoppingListState>,
  locale: string,
  previousGenerationLabel: string,
  labels: {
    generated: (value: string) => string;
    unitPrice: string;
    purchasePrice: string;
    inventoryDecrease: string;
    inventoryShortage: (count: number) => string;
    notes: string;
  },
) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const generationGroups = groupShoppingListGenerations(state, locale, previousGenerationLabel);

  const brandsHtml = generationGroups
    .map(
      (generation) => `
    <section>
      <h2>${escapeHtml(labels.generated(generation.label))}</h2>
      ${generation.brandGroups
        .map(
          (group) => `
        <h3>${escapeHtml(group.brandName)}</h3>
        <ul>
          ${group.products
            .map(
              (product) => `
            <li style="${
              product.checked
                ? 'opacity: 0.65; text-decoration: line-through;'
                : product.inventoryQuantity != null && product.inventoryQuantity > 0
                  ? 'color: #166534; background: #dcfce7; border: 1px solid #86efac; border-radius: 10px; padding: 8px 10px;'
                  : ''
            }">
              <div style="display: flex; align-items: flex-start; gap: 10px;">
                ${product.thumbnailUrl ? `<img src="${escapeHtml(product.thumbnailUrl)}" alt="${escapeHtml(product.title)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 8px; border: 1px solid #d4d4d8; flex: none;" />` : ''}
                <div>
                  <strong>${product.checked ? '&#10003; ' : ''}${escapeHtml(product.title)}</strong> x${product.quantity}
                  ${product.unitPrice == null ? '' : `<div>${escapeHtml(labels.unitPrice)}: ${escapeHtml(formatCurrency(locale, product.unitPrice))}${product.purchasePrice == null ? '' : ` | ${escapeHtml(labels.purchasePrice)}: ${escapeHtml(formatCurrency(locale, product.purchasePrice))}`}</div>`}
                  ${product.inventoryActionEligible ? `<div>${escapeHtml(labels.inventoryDecrease)}: ${product.inventoryDecreaseQuantity}${product.inventoryShortageQuantity > 0 ? ` | ${escapeHtml(labels.inventoryShortage(product.inventoryShortageQuantity))}` : ''}</div>` : ''}
                  ${product.notes.length ? `<div>${escapeHtml(labels.notes)}: ${escapeHtml(product.notes.join(' | '))}</div>` : ''}
                </div>
              </div>
            </li>
          `,
            )
            .join('')}
        </ul>
      `,
        )
        .join('')}
    </section>
  `,
    )
    .join('');

  const ordersHtml = generationGroups
    .map(
      (generation) => `
    <section>
      <h2>${escapeHtml(labels.generated(generation.label))}</h2>
      <ul>
        ${generation.orders
          .map(
            (order) => `
          <li>
            <h3>#${order.orderId} ${escapeHtml(order.customerName)}</h3>
            ${order.note ? `<p>${escapeHtml(labels.notes)}: ${escapeHtml(order.note)}</p>` : ''}
            <ul>
              ${order.products
                .map(
                  (product) => `
                <li>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${product.thumbnailUrl ? `<img src="${escapeHtml(product.thumbnailUrl)}" alt="${escapeHtml(product.title)}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid #d4d4d8; flex: none;" />` : ''}
                    <span>${escapeHtml(product.brandName)} / ${escapeHtml(product.title)} x${product.quantity}</span>
                  </div>
                </li>
              `,
                )
                .join('')}
            </ul>
          </li>
        `,
          )
          .join('')}
      </ul>
    </section>
  `,
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(state.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      h1 { margin-bottom: 24px; }
      h2 { margin: 0 0 8px; font-size: 18px; }
      h3 { margin: 10px 0 6px; font-size: 14px; }
      section { margin-bottom: 20px; break-inside: avoid; }
      ul { margin: 0; padding-left: 20px; }
      li { margin-bottom: 6px; }
      @media print { body { margin: 12px; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(state.title)}</h1>
    <div class="grid">
      <div>${brandsHtml}</div>
      <div>${ordersHtml}</div>
    </div>
  </body>
</html>`;
}
