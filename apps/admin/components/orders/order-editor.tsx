'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails may use legacy external origins. */

import { useQuery } from '@tanstack/react-query';
import { Check, Minus, Package, Phone, Plus, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useStorefrontBaseUrl } from '../storefront-origin';
import { useDeferredValue, useMemo, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import {
  formatOrderPhoneForDisplay,
  formatOrderRegionLabel,
  formatOrderStateValue,
  normalizeOrderCommuneValue,
  normalizeOrderPhoneForStorage,
  parseOrderStateDraftValue,
  resolveEcotrackDeliveryFee,
  resolveOrderCommuneForState,
  splitOrderFullNameDraft,
} from '../../lib/order-presentation';
import {
  getOrderStatusLabelKey,
  ORDER_STATUS,
  orderPatchSchema,
  parseNumericAmount,
  type OrderPatch,
  type OrderRecord,
  type OrderStatus,
} from '../../lib/orders';
import { cn } from '../../lib/utils';
import { buildStorefrontProductHref } from '../products/storefront-links';
import { Button } from '../ui/button';
import { FormSection } from '../ui/form-section';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Textarea } from '../ui/textarea';
import {
  areCartProductsEqual,
  buildEditableProducts,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
  type ProductSearchResponse,
} from './order-products-editor';
import {
  formatOrderDate,
  formatOrderMoney,
  orderStatusOptions,
  orderStatusTone,
} from './orders-workspace-presenters';
import { ReturningCustomerIndicator } from './returning-customer-indicator';

type OrderDetailResponse = { ok: true; item: OrderRecord };

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
  if (phoneNumber1 !== order.phoneNumber1) changes.phoneNumber1 = phoneNumber1;
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

function OrderProductThumbnail({
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

function OrderEditorBody({
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
  onSave: (order: OrderRecord, patch: OrderPatch) => Promise<void>;
}) {
  const locale = useLocale();
  const storefrontBaseUrl = useStorefrontBaseUrl();
  const t = useTranslations();
  const [draft, setDraft] = useState(() => buildDraft(order, catalog));
  const [productSearch, setProductSearch] = useState('');
  const deferredProductSearch = useDeferredValue(productSearch.trim());
  const productSearchQuery = useQuery({
    queryKey: ['orders-selected-product-search', deferredProductSearch],
    enabled: deferredProductSearch.length > 0,
    queryFn: async () => {
      const result = await request<ProductSearchResponse>(
        `/api/products?page=1&limit=6&search=${encodeURIComponent(deferredProductSearch)}`,
      );
      return result.items.map((product) => ({
        ...product,
        price: parseNumericAmount(product.price),
      }));
    },
    staleTime: 30_000,
  });

  const selectedProducts = summarizeEditableProducts(draft.products);
  const productSubtotal = selectedProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const deliveryFee = resolveEcotrackDeliveryFee(
    catalog,
    draft.delivery,
    draft.state,
    order.deliveryFee,
  );
  // Snapshot line totals already contain the effective promotional price.
  const total = productSubtotal + deliveryFee;
  const wilayaId = Number.parseInt(draft.state, 10);
  const communeOptions = Number.isInteger(wilayaId)
    ? (catalog?.communes.filter((entry) => entry.wilayaId === wilayaId) ?? [])
    : [];
  const dirty = useMemo(
    () => Object.keys(buildOrderChanges(order, draft, catalog)).length > 0,
    [catalog, draft, order],
  );
  const valid = normalizeOrderPhoneForStorage(draft.phoneNumber1).length > 0;

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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && valid && writable) void onSave(order, buildPatch(order, draft, catalog));
      }}
    >
      <FormSection title={t('adminWorkspace.orders.customerDetails')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('ordersManager.name.label')}
            <Input
              value={draft.fullName}
              disabled={!writable}
              onChange={(event) => change('fullName', event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('ordersManager.phone.label')}
            <div className="flex gap-2">
              <Input
                value={draft.phoneNumber1}
                disabled={!writable}
                inputMode="tel"
                onChange={(event) => change('phoneNumber1', event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="size-10 shrink-0 px-0"
                aria-label={t('ordersManager.phone.call')}
                onClick={() => {
                  window.location.href = `tel:${draft.phoneNumber1.replace(/\s+/g, '')}`;
                }}
              >
                <Phone className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </label>
        </div>
        {order.phoneNumber2 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('adminWorkspace.orders.secondaryPhone')}:{' '}
            {formatOrderPhoneForDisplay(order.phoneNumber2)}
          </p>
        ) : null}
        <ReturningCustomerIndicator orderId={order.id} />
      </FormSection>

      <FormSection title={t('adminWorkspace.orders.statusAndOwnership')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('adminWorkspace.orders.status')}
            <NativeSelect
              value={String(draft.inHouseStatus)}
              disabled={!writable}
              onChange={(event) => {
                const inHouseStatus = Number(event.target.value) as OrderStatus;
                setDraft((current) => ({
                  ...current,
                  inHouseStatus,
                  noAnswerCount:
                    inHouseStatus === ORDER_STATUS.NO_ANSWER
                      ? Math.max(current.noAnswerCount, 1)
                      : 0,
                }));
              }}
            >
              {orderStatusOptions.map((status) => (
                <NativeSelectOption
                  key={status}
                  value={status}
                  disabled={status === ORDER_STATUS.POSTED}
                >
                  {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {draft.inHouseStatus === ORDER_STATUS.NO_ANSWER ? (
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t('adminWorkspace.orders.noAnswerAttempts')}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="size-10 px-0"
                  disabled={!writable || draft.noAnswerCount <= 1}
                  onClick={() => change('noAnswerCount', Math.max(1, draft.noAnswerCount - 1))}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <Input
                  value={draft.noAnswerCount}
                  type="number"
                  min="1"
                  max="99"
                  disabled={!writable}
                  className="text-center tabular-nums"
                  onChange={(event) => change('noAnswerCount', Number(event.target.value))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="size-10 px-0"
                  disabled={!writable || draft.noAnswerCount >= 99}
                  onClick={() => change('noAnswerCount', Math.min(99, draft.noAnswerCount + 1))}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </label>
          ) : (
            <div className="rounded-[var(--shape-radius-card-compact)] bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              {order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}
              <span className="mt-1 block">
                {order.confirmedAt
                  ? formatOrderDate(locale, order.confirmedAt, true)
                  : t('ordersManager.unconfirmedDate')}
              </span>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        title={t('adminWorkspace.orders.fulfillment')}
        description={formatOrderRegionLabel(
          catalog,
          draft.state,
          draft.city,
          t('ordersManager.placeholders.region'),
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('ordersManager.address.delivery')}
            <NativeSelect
              value={String(draft.delivery)}
              disabled={!writable}
              onChange={(event) => change('delivery', Number(event.target.value) as 0 | 1)}
            >
              <NativeSelectOption value="0">{t('ordersManager.delivery.home')}</NativeSelectOption>
              <NativeSelectOption value="1">
                {t('ordersManager.delivery.office')}
              </NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('ordersManager.address.region')}
            <NativeSelect
              value={draft.state}
              disabled={!writable}
              onChange={(event) => {
                const state = event.target.value;
                setDraft((current) => ({
                  ...current,
                  state,
                  city: resolveOrderCommuneForState(catalog, state, current.city),
                }));
              }}
            >
              <NativeSelectOption value="">
                {t('ordersManager.placeholders.region')}
              </NativeSelectOption>
              {catalog?.wilayas.map((wilaya) => (
                <NativeSelectOption key={wilaya.wilayaId} value={wilaya.wilayaId}>
                  {wilaya.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('ordersManager.address.city')}
            <NativeSelect
              value={draft.city}
              disabled={!writable || !draft.state}
              onChange={(event) => change('city', event.target.value)}
            >
              <NativeSelectOption value="">
                {t('ordersManager.placeholders.city')}
              </NativeSelectOption>
              {communeOptions.map((commune) => (
                <NativeSelectOption key={commune.communeId} value={commune.communeId}>
                  {commune.name}
                </NativeSelectOption>
              ))}
              {draft.city &&
              !communeOptions.some((commune) => String(commune.communeId) === draft.city) ? (
                <NativeSelectOption value={draft.city}>
                  {order.city ?? draft.city}
                </NativeSelectOption>
              ) : null}
            </NativeSelect>
          </label>
          {draft.delivery === 0 ? (
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t('ordersManager.placeholders.street')}
              <Input
                value={draft.homeAddress}
                disabled={!writable}
                onChange={(event) => change('homeAddress', event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </FormSection>

      <FormSection title={t('adminWorkspace.orders.orderContents')}>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
          <Input
            value={productSearch}
            disabled={!writable}
            className="ps-9"
            placeholder={t('ordersManager.products.searchPlaceholder')}
            onChange={(event) => setProductSearch(event.target.value)}
          />
          {deferredProductSearch ? (
            <div className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-[var(--shape-radius-card)] border border-border/65 bg-background shadow-[var(--shadow-vapor-strong)]">
              {productSearchQuery.isFetching ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  {t('ordersManager.products.searchLoading')}
                </p>
              ) : null}
              {productSearchQuery.data?.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-start transition-colors last:border-b-0 hover:bg-muted/50"
                  onClick={() => addProduct(product)}
                >
                  {product.images[0] ? (
                    <img
                      src={product.images[0]}
                      alt=""
                      className="size-9 rounded-[var(--shape-radius-soft-xs)] object-cover"
                    />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-[var(--shape-radius-soft-xs)] bg-muted">
                      <Package className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatOrderMoney(locale, parseNumericAmount(product.price))}
                    </span>
                  </span>
                  <Plus className="size-4 text-primary" aria-hidden="true" />
                </button>
              ))}
              {!productSearchQuery.isFetching && productSearchQuery.data?.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  {t('ordersManager.products.searchEmpty')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 divide-y divide-border/55 overflow-hidden rounded-[var(--shape-radius-card)] border border-border/60">
          {selectedProducts.map((product) => (
            <div
              key={product.rawValue}
              className="flex flex-wrap items-center gap-3 bg-background px-3 py-3"
            >
              <OrderProductThumbnail product={product} />
              <div className="min-w-0 flex-1">
                {product.productId !== null && !product.missing ? (
                  <a
                    href={buildStorefrontProductHref(
                      {
                        id: product.productId,
                        slug: product.slug ?? null,
                      },
                      storefrontBaseUrl,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                  >
                    {product.title}
                  </a>
                ) : (
                  <p className="truncate text-sm font-medium">{product.title}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatOrderMoney(locale, product.unitPrice)} ·{' '}
                  {formatOrderMoney(locale, product.lineTotal)}
                </p>
              </div>
              <div className="ms-auto flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="size-8 px-0"
                  disabled={!writable}
                  aria-label={t('ordersManager.products.decreaseQuantity', {
                    title: product.title,
                  })}
                  onClick={() => decrease(product.rawValue)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-7 text-center text-sm font-semibold tabular-nums">
                  {product.quantity}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="size-8 px-0"
                  disabled={!writable}
                  aria-label={t('ordersManager.products.increaseQuantity', {
                    title: product.title,
                  })}
                  onClick={() => increase(product.rawValue)}
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ms-1 h-8 px-2 text-xs text-destructive"
                  disabled={!writable}
                  aria-label={t('ordersManager.products.removeProduct', {
                    title: product.title,
                  })}
                  onClick={() => remove(product.rawValue)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
          {selectedProducts.length === 0 ? (
            <p className="bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              {t('ordersManager.products.empty')}
            </p>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[var(--shape-radius-card)] bg-muted/30 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{t('ordersManager.amount.subtotal')}</dt>
          <dd className="text-end font-medium tabular-nums">
            {formatOrderMoney(locale, productSubtotal)}
          </dd>
          <dt className="text-muted-foreground">{t('ordersManager.amount.deliveryFee')}</dt>
          <dd className="text-end tabular-nums">{formatOrderMoney(locale, deliveryFee)}</dd>
          {(order.promoDiscountAmount ?? 0) > 0 ? (
            <>
              <dt className="text-muted-foreground">
                {t('ordersManager.amount.promoDiscount', {
                  code: order.productPromos?.length
                    ? order.productPromos.map((offer) => offer.code).join(', ')
                    : (order.promoCode ?? ''),
                })}
              </dt>
              <dd className="text-end text-emerald-700 tabular-nums">
                -{formatOrderMoney(locale, order.promoDiscountAmount ?? 0)}
              </dd>
            </>
          ) : null}
          <dt className="border-t border-border/60 pt-2 font-semibold">
            {t('ordersManager.amount.total')}
          </dt>
          <dd className="border-t border-border/60 pt-2 text-end font-semibold tabular-nums">
            {formatOrderMoney(locale, total)}
          </dd>
        </dl>
      </FormSection>

      <FormSection title={t('adminWorkspace.orders.notes')}>
        <Textarea
          value={draft.note}
          disabled={!writable}
          maxLength={500}
          aria-label={t('adminWorkspace.orders.notes')}
          className="min-h-24"
          onChange={(event) => change('note', event.target.value)}
        />
        <p className="mt-1 text-end text-xs text-muted-foreground tabular-nums">
          {draft.note.length}/500
        </p>
      </FormSection>

      <div className="sticky bottom-0 flex items-center gap-3 bg-background/88 px-4 py-3 backdrop-blur-xl sm:px-5">
        <p className="me-auto text-xs text-muted-foreground">
          {dirty ? t('adminWorkspace.common.unsaved') : t('adminWorkspace.common.upToDate')}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => setDraft(buildDraft(order, catalog))}
        >
          {t('actions.cancel')}
        </Button>
        <Button type="submit" disabled={!writable || !dirty || !valid || pending}>
          {pending ? <Spinner className="size-4" /> : <Check className="size-4" />}
          {t('adminWorkspace.orders.saveChanges')}
        </Button>
      </div>
    </form>
  );
}

export function OrderEditor({
  order,
  catalog,
  writable,
  pending,
  onSave,
}: {
  order: OrderRecord | null;
  catalog?: EcotrackCatalogResponse;
  writable: boolean;
  pending: boolean;
  onSave: (order: OrderRecord, patch: OrderPatch) => Promise<void>;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['orders-workspace-detail', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
  const detail = detailQuery.data?.item ?? order;

  if (!detail) {
    return (
      <div className="grid min-h-80 place-items-center px-6 text-center text-sm text-muted-foreground">
        {t('adminWorkspace.orders.selectOrder')}
      </div>
    );
  }

  if (detailQuery.isFetching) {
    return (
      <div className="grid min-h-[32rem] place-items-center px-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Spinner className="size-4" />
          {t('labels.loading')}
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {detailQuery.isError ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-5">
          {detailQuery.error.message}
        </p>
      ) : null}
      <header className="border-b border-border/60 bg-card/45 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">#{detail.id}</p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-[var(--type-tracking-n020)]">
              {detail.fullName}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatOrderDate(locale, detail.createdAt, true)}
            </p>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-vapor)]">
            <span className={cn('size-2 rounded-full', orderStatusTone(detail.inHouseStatus))} />
            {t(`ordersManager.status.${getOrderStatusLabelKey(detail.inHouseStatus)}`)}
          </span>
        </div>
      </header>
      <OrderEditorBody
        key={`${detail.id}:${detail.updatedAt}`}
        order={detail}
        catalog={catalog}
        writable={writable}
        pending={pending}
        onSave={onSave}
      />
    </div>
  );
}
