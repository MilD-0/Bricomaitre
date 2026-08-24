import { requestJson as request } from '../../lib/admin-api';
import { parseNumericAmount, type OrderRecord } from '../../lib/orders';
import {
  buildShoppingListScopeKey,
  buildGeneratedShoppingListDraft,
  buildShoppingListInventoryPreview,
  mergeShoppingListDraft,
  normalizeShoppingListOrderIds,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
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

export function buildShoppingListDraftUrl(
  sourceMode: ShoppingListSourceMode,
  orderIds: readonly number[],
) {
  const params = new URLSearchParams({ sourceMode });
  normalizeShoppingListOrderIds(orderIds).forEach((orderId) => {
    params.append('orderIds', String(orderId));
  });

  return `/api/orders/shopping-list-draft?${params.toString()}`;
}

export async function fetchShoppingListDraft(
  sourceMode: ShoppingListSourceMode,
  orderIds: readonly number[],
) {
  return request<ShoppingListDraftResponse>(buildShoppingListDraftUrl(sourceMode, orderIds));
}

export async function saveShoppingListDraft(state: NonNullable<ShoppingListState>) {
  const payload: ShoppingListDraftPayload = {
    sourceMode: state.sourceMode,
    orderIds: state.orderIds,
    title: state.title,
    generatedItems: state.generatedItems,
    draftItems: state.draftItems,
    orders: state.orders,
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
    title: title ?? draft.title,
    generatedItems: draft.generatedItems,
    draftItems: draft.draftItems,
    orders: draft.orders,
    search: '',
    updatedAt: draft.updatedAt,
    updatedByName: draft.updatedByName,
  };
}

async function fetchBrandName(brandId: number | null, cache: Map<number, string>) {
  if (brandId === null) {
    return 'Unbranded';
  }

  const cached = cache.get(brandId);
  if (cached) {
    return cached;
  }

  const brand = await request<BrandLookupResponse>(`/api/brands/${brandId}`);
  cache.set(brandId, brand.name);
  return brand.name;
}

async function fetchShoppingListProductDetails(
  productId: number | null,
  cache: Map<number, ProductLookupResponse['item']>,
) {
  if (productId === null) {
    return null;
  }

  const cached = cache.get(productId);
  if (cached !== undefined) {
    return cached;
  }

  const product = await request<ProductLookupResponse>(`/api/products/${productId}`);
  cache.set(productId, product.item);
  return product.item;
}

export function buildInventoryPreview(quantity: number, inventoryQuantity: number | null) {
  return buildShoppingListInventoryPreview(quantity, inventoryQuantity);
}

export function recalculateShoppingListInventory(
  item: ShoppingListDraftItem,
  overrides?: Partial<
    Pick<ShoppingListDraftItem, 'quantity' | 'inventoryQuantity' | 'inventoryAppliedQuantity'>
  >,
) {
  const quantity = overrides?.quantity ?? item.quantity;
  const inventoryQuantity = overrides?.inventoryQuantity ?? item.inventoryQuantity;
  const nextPreview = buildInventoryPreview(quantity, inventoryQuantity);

  return {
    ...item,
    quantity,
    inventoryQuantity,
    inventoryDecreaseQuantity: nextPreview.inventoryDecreaseQuantity,
    inventoryShortageQuantity: nextPreview.inventoryShortageQuantity,
    inventoryActionEligible: item.productId != null && nextPreview.inventoryActionEligible,
    inventoryAppliedQuantity: overrides?.inventoryAppliedQuantity ?? item.inventoryAppliedQuantity,
  };
}

async function buildShoppingListState(
  orders: OrderRecord[],
  sourceMode: ShoppingListSourceMode,
  title: string,
) {
  const brandCache = new Map<number, string>();
  const productDetailsCache = new Map<number, ProductLookupResponse['item']>();
  const generated = await buildGeneratedShoppingListDraft({
    orders,
    sourceMode,
    title,
    resolveProductDetails: async (productId) => {
      const product = await fetchShoppingListProductDetails(productId, productDetailsCache);
      return product
        ? {
            inventoryQuantity: product.inventoryQuantity,
            purchasePrice:
              product.purchasePrice == null ? null : parseNumericAmount(product.purchasePrice),
          }
        : null;
    },
    resolveBrandName: (brandId) => fetchBrandName(brandId, brandCache),
  });

  return {
    ...generated,
    scopeKey: buildShoppingListScopeKey(sourceMode, generated.orderIds),
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
      <h2>Generated ${escapeHtml(generation.label)}</h2>
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
                  ${product.unitPrice == null ? '' : `<div>Unit price: ${escapeHtml(formatCurrency(locale, product.unitPrice))}${product.purchasePrice == null ? '' : ` | Purchase price: ${escapeHtml(formatCurrency(locale, product.purchasePrice))}`}</div>`}
                  ${product.inventoryActionEligible ? `<div>Inventory decrease: ${product.inventoryDecreaseQuantity}${product.inventoryShortageQuantity > 0 ? ` | Short: ${product.inventoryShortageQuantity}` : ''}</div>` : ''}
                  ${product.notes.length ? `<div>Notes: ${escapeHtml(product.notes.join(' | '))}</div>` : ''}
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
      <h2>Generated ${escapeHtml(generation.label)}</h2>
      <ul>
        ${generation.orders
          .map(
            (order) => `
          <li>
            <h3>#${order.orderId} ${escapeHtml(order.customerName)}</h3>
            ${order.note ? `<p>Note: ${escapeHtml(order.note)}</p>` : ''}
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
