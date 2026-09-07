'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails may use legacy external origins. */

import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';
import { useStorefrontBaseUrl } from '../../storefront-origin';

import { requestJson as request } from '../../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../../lib/ecotrack-admin-contracts';
import {
  formatOrderPhoneForDisplay,
  formatOrderStateValue,
  normalizeOrderCommuneValue,
  normalizeOrderPhoneForStorage,
  parseOrderStateDraftValue,
  resolveEcotrackDeliveryFee,
  splitOrderFullNameDraft,
} from '../../../lib/order-presentation';
import {
  ORDER_STATUS,
  orderPatchSchema,
  parseNumericAmount,
  type OrderPatch,
  type OrderRecord,
  type OrderStatus,
} from '../../../lib/orders';
import {
  areCartProductsEqual,
  buildEditableProducts,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
  type ProductSearchResponse,
} from '../order-products-editor';

type OrderEditorDraft = {
  fullName: string;
  phoneNumber1: string;
  inHouseStatus: OrderStatus;
  noAnswerCount: number;
  delivery: 0 | 1;
  state: string;
  city: string;
  homeAddress: string;
  note: string;
  products: EditableOrderProduct[];
};

function buildDraft(order: OrderRecord, catalog?: EcotrackCatalogResponse): OrderEditorDraft {
  return {
    fullName: order.fullName,
    phoneNumber1: formatOrderPhoneForDisplay(order.phoneNumber1),
    inHouseStatus: order.inHouseStatus,
    noAnswerCount: order.noAnswerCount,
    delivery: order.delivery,
    state: formatOrderStateValue(order.state),
    city: normalizeOrderCommuneValue(order.state, order.city, catalog),
    homeAddress: order.homeAddress ?? '',
    note: order.note ?? '',
    products: buildEditableProducts(order),
  };
}

function buildOrderChanges(
  order: OrderRecord,
  draft: OrderEditorDraft,
  catalog?: EcotrackCatalogResponse,
): Partial<OrderPatch> {
  const name = splitOrderFullNameDraft(draft.fullName);
  const initial = buildDraft(order, catalog);
  const changes: Partial<OrderPatch> = {};
  const phoneNumber1 = normalizeOrderPhoneForStorage(draft.phoneNumber1);
  const noAnswerCount =
    draft.inHouseStatus === ORDER_STATUS.NO_ANSWER ? Math.max(1, draft.noAnswerCount) : 0;
  const state = parseOrderStateDraftValue(draft.state);
  const city = draft.city.trim() || null;
  const homeAddress = draft.homeAddress.trim() || null;
  const cartProducts = draft.products.map((product) => product.rawValue.trim()).filter(Boolean);
  const note = draft.note.trim() || null;

  if (draft.fullName !== initial.fullName) {
    changes.firstName = name.firstName;
    changes.lastName = name.lastName;
  }
  if (
    draft.phoneNumber1 !== initial.phoneNumber1 &&
    phoneNumber1 !== normalizeOrderPhoneForStorage(order.phoneNumber1)
  )
    changes.phoneNumber1 = phoneNumber1;
  if (draft.inHouseStatus !== order.inHouseStatus) {
    changes.inHouseStatus = draft.inHouseStatus;
  }
  if (noAnswerCount !== order.noAnswerCount) changes.noAnswerCount = noAnswerCount;
  if (draft.delivery !== order.delivery) changes.delivery = draft.delivery;
  if (draft.state !== initial.state) changes.state = state;
  if (draft.city !== initial.city) changes.city = city;
  if (draft.homeAddress !== initial.homeAddress) changes.homeAddress = homeAddress;
  if (!areCartProductsEqual(cartProducts, order.cartProducts)) changes.cartProducts = cartProducts;
  if (note !== (order.note ?? null)) changes.note = note;

  return changes;
}

function buildPatch(
  order: OrderRecord,
  draft: OrderEditorDraft,
  catalog?: EcotrackCatalogResponse,
): OrderPatch {
  return orderPatchSchema.parse(buildOrderChanges(order, draft, catalog));
}

export function OrderProductThumbnail({
  product,
}: {
  product: ReturnType<typeof summarizeEditableProducts>[number];
}) {
  return product.thumbnailUrl ? (
    <img
      src={product.thumbnailUrl}
      alt=""
      className="size-10 shrink-0 rounded-[var(--shape-radius-soft-sm)] object-cover"
    />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-[var(--shape-radius-soft-sm)] bg-muted text-muted-foreground">
      <Package className="size-4" aria-hidden="true" />
    </span>
  );
}

export function useOrderEditorBody({
  order,
  catalog,
  writable,
  pending,
  onSave,
}: {
  order: OrderRecord;
  catalog?: EcotrackCatalogResponse;
  writable: boolean;
  pending: boolean;
  onSave: (order: OrderRecord, patch: OrderPatch) => Promise<OrderRecord | null>;
}) {
  const locale = useLocale();
  const storefrontBaseUrl = useStorefrontBaseUrl();
  const t = useTranslations();
  const [baseline, setBaseline] = useState(order);
  const [draft, setDraft] = useState(() => buildDraft(order, catalog));
  const [productSearch, setProductSearch] = useState('');
  const deferredProductSearch = useDeferredValue(productSearch.trim());
  const productSearchQuery = useQuery({
    queryKey: ['orders-selected-product-search', deferredProductSearch],
    enabled: deferredProductSearch.length > 0,
    queryFn: async () => {
      const result = await request<ProductSearchResponse>(
        `/api/orders/product-options?limit=6&search=${encodeURIComponent(deferredProductSearch)}`,
      );
      return result.items.map((product) => ({
        ...product,
        price: parseNumericAmount(product.price),
      }));
    },
    staleTime: 30_000,
  });

  const selectedProducts = summarizeEditableProducts(draft.products);
  const commercialChanges = buildOrderChanges(baseline, draft, catalog);
  const productsChanged = commercialChanges.cartProducts !== undefined;
  const deliveryChanged =
    commercialChanges.delivery !== undefined ||
    commercialChanges.state !== undefined ||
    commercialChanges.city !== undefined;
  const productSubtotal = productsChanged
    ? selectedProducts.reduce((sum, product) => sum + product.lineTotal, 0)
    : (baseline.subtotalOverride ?? baseline.productSubtotal);
  const deliveryFee = deliveryChanged
    ? resolveEcotrackDeliveryFee(catalog, draft.delivery, draft.state, baseline.deliveryFee)
    : baseline.deliveryFee;
  // Unrelated edits retain accepted amounts, including manual subtotal overrides.
  const total =
    productsChanged || deliveryChanged ? productSubtotal + deliveryFee : baseline.totalAmount;
  const wilayaId = Number.parseInt(draft.state, 10);
  const communeOptions = Number.isInteger(wilayaId)
    ? (catalog?.communes.filter((entry) => entry.wilayaId === wilayaId) ?? [])
    : [];
  const dirty = useMemo(
    () => Object.keys(buildOrderChanges(baseline, draft, catalog)).length > 0,
    [catalog, draft, baseline],
  );
  const valid = orderPatchSchema.safeParse(buildOrderChanges(baseline, draft, catalog)).success;
  const changedElsewhere = baseline.updatedAt !== order.updatedAt;
  if (baseline !== order && !dirty && !pending) {
    setBaseline(order);
    setDraft(buildDraft(order, catalog));
  }
  const loadLatest = () => {
    setBaseline(order);
    setDraft(buildDraft(order, catalog));
  };
  const save = async () => {
    const saved = await onSave(baseline, buildPatch(baseline, draft, catalog));
    if (saved) {
      setBaseline(saved);
      setDraft(buildDraft(saved, catalog));
    }
  };

  const change = <K extends keyof OrderEditorDraft>(key: K, value: OrderEditorDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const addProduct = (product: ProductSearchItem) => {
    change('products', [
      ...draft.products,
      {
        rawValue: String(product.id),
        productId: product.id,
        ...(product.slug !== undefined ? { slug: product.slug } : {}),
        title: product.title,
        unitPrice: parseNumericAmount(product.price),
        thumbnailUrl: product.images[0] ?? null,
        missing: false,
      },
    ]);
    setProductSearch('');
  };
  const increase = (rawValue: string) => {
    const existing = draft.products.find((product) => product.rawValue === rawValue);
    if (existing) change('products', [...draft.products, existing]);
  };
  const decrease = (rawValue: string) => {
    const index = draft.products.findIndex((product) => product.rawValue === rawValue);
    if (index !== -1) {
      change(
        'products',
        draft.products.filter((_, productIndex) => productIndex !== index),
      );
    }
  };
  const remove = (rawValue: string) =>
    change(
      'products',
      draft.products.filter((product) => product.rawValue !== rawValue),
    );

  return {
    view: {
      dirty,
      valid,
      writable,
      pending,
      save,
      changedElsewhere,
      t,
      loadLatest,
      draft,
      change,
      order,
      setDraft,
      locale,
      catalog,
      communeOptions,
      productSearch,
      setProductSearch,
      deferredProductSearch,
      productSearchQuery,
      addProduct,
      selectedProducts,
      storefrontBaseUrl,
      decrease,
      increase,
      remove,
      productSubtotal,
      deliveryFee,
      total,
    } as const,
    fallback: null,
  };
}
