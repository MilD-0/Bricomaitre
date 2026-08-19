'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails may use legacy external origins. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  Package,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import type {
  DailyOrderStatusOverview,
  OrdersResponse,
  ProfitProjectionBasis,
} from '../../lib/order-admin-contracts';
import { buildOrderTrackingUrl } from '../../lib/order-tracking-link';
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
  orderPatchSchema,
  parseNumericAmount,
  type OrderPatch,
  type OrderRecord,
  type OrderStatus,
} from '../../lib/orders';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import {
  areCartProductsEqual,
  buildEditableProducts,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
  type ProductSearchResponse,
} from './order-products-editor';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { OrdersWorkflows } from './orders-workflows';
import { OrderSalesDesk } from './order-sales-desk';
import { ReturningCustomerIndicator } from './returning-customer-indicator';

const statusOptions: OrderStatus[] = [0, 1, 2, 11, 3, 7, 4, 10, 5, 6, 8, 9];

type OrderDetailResponse = { ok: true; item: OrderRecord };
type TrackingTokenResponse = { ok: true; publicToken: string };
type DeleteTarget = { id: number; label: string };
type PaginationItem = number | `ellipsis-${number}`;
type OrderEditorDraft = {
  fullName: string;
  phoneNumber1: string;
  confirmed: OrderStatus;
  noAnswerCount: number;
  delivery: 0 | 1;
  state: string;
  city: string;
  homeAddress: string;
  note: string;
  products: EditableOrderProduct[];
};

function formatMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(locale: string, value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

function statusTone(status: OrderStatus) {
  if ([2, 4, 10].includes(status)) return 'bg-emerald-500';
  if ([1, 5].includes(status)) return 'bg-amber-500';
  if ([6, 8, 9].includes(status)) return 'bg-rose-500';
  if ([3, 7, 11].includes(status)) return 'bg-sky-500';
  return 'bg-muted-foreground/55';
}

function productSummary(order: OrderRecord) {
  const first = order.orderProducts[0];
  if (!first) return '—';
  const additional = order.orderProducts.length - 1;
  return `${first.title}${additional > 0 ? ` +${additional}` : ''}`;
}

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const visiblePages =
    currentPage <= 4
      ? [1, 2, 3, 4, 5, totalPages]
      : currentPage >= totalPages - 3
        ? [1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
        : [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
  const items: PaginationItem[] = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage && page - previousPage > 1) items.push(`ellipsis-${previousPage}`);
    items.push(page);
  });

  return items;
}

function CompactActionsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute end-0 top-full z-30 mt-1.5 min-w-48 overflow-hidden rounded-md border border-border/70 bg-popover py-1 text-popover-foreground shadow-lg"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ActionMenuButton({
  children,
  destructive = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45',
        destructive && 'text-destructive',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function buildDraft(order: OrderRecord, catalog?: EcotrackCatalogResponse): OrderEditorDraft {
  return {
    fullName: order.fullName,
    phoneNumber1: formatOrderPhoneForDisplay(order.phoneNumber1),
    confirmed: order.confirmed,
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
  const noAnswerCount = draft.confirmed === 1 ? Math.max(1, draft.noAnswerCount) : 0;
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
  if (draft.confirmed !== order.confirmed) changes.confirmed = draft.confirmed;
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

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-5 sm:px-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
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
      className="size-10 shrink-0 rounded-[0.7rem] object-cover"
    />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-[0.7rem] bg-muted text-muted-foreground">
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
      <EditorSection title={t('adminWorkspace.orders.customerDetails')}>
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
      </EditorSection>

      <EditorSection title={t('adminWorkspace.orders.statusAndOwnership')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t('adminWorkspace.orders.status')}
            <NativeSelect
              value={String(draft.confirmed)}
              disabled={!writable}
              onChange={(event) => {
                const confirmed = Number(event.target.value) as OrderStatus;
                setDraft((current) => ({
                  ...current,
                  confirmed,
                  noAnswerCount: confirmed === 1 ? Math.max(current.noAnswerCount, 1) : 0,
                }));
              }}
            >
              {statusOptions.map((status) => (
                <NativeSelectOption key={status} value={status} disabled={status === 11}>
                  {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {draft.confirmed === 1 ? (
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
            <div className="rounded-[0.9rem] bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              {order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}
              <span className="mt-1 block">
                {order.confirmedAt
                  ? formatDate(locale, order.confirmedAt, true)
                  : t('ordersManager.unconfirmedDate')}
              </span>
            </div>
          )}
        </div>
      </EditorSection>

      <EditorSection
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
      </EditorSection>

      <EditorSection title={t('adminWorkspace.orders.orderContents')}>
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
            <div className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-[1rem] border border-border/65 bg-background shadow-[var(--shadow-vapor-strong)]">
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
                      className="size-9 rounded-[0.6rem] object-cover"
                    />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-[0.6rem] bg-muted">
                      <Package className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatMoney(locale, parseNumericAmount(product.price))}
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

        <div className="mt-4 divide-y divide-border/55 overflow-hidden rounded-[1rem] border border-border/60">
          {selectedProducts.map((product) => (
            <div
              key={product.rawValue}
              className="flex flex-wrap items-center gap-3 bg-background px-3 py-3"
            >
              <OrderProductThumbnail product={product} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{product.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(locale, product.unitPrice)} ·{' '}
                  {formatMoney(locale, product.lineTotal)}
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

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[1rem] bg-muted/30 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{t('ordersManager.amount.subtotal')}</dt>
          <dd className="text-end font-medium tabular-nums">
            {formatMoney(locale, productSubtotal)}
          </dd>
          <dt className="text-muted-foreground">{t('ordersManager.amount.deliveryFee')}</dt>
          <dd className="text-end tabular-nums">{formatMoney(locale, deliveryFee)}</dd>
          {(order.promoDiscountAmount ?? 0) > 0 ? (
            <>
              <dt className="text-muted-foreground">
                {t('ordersManager.amount.promoDiscount', { code: order.promoCode ?? '' })}
              </dt>
              <dd className="text-end text-emerald-700 tabular-nums">
                -{formatMoney(locale, order.promoDiscountAmount ?? 0)}
              </dd>
            </>
          ) : null}
          <dt className="border-t border-border/60 pt-2 font-semibold">
            {t('ordersManager.amount.total')}
          </dt>
          <dd className="border-t border-border/60 pt-2 text-end font-semibold tabular-nums">
            {formatMoney(locale, total)}
          </dd>
        </dl>
      </EditorSection>

      <EditorSection title={t('adminWorkspace.orders.notes')}>
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
      </EditorSection>

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

function OrderEditor({
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
            <h2 className="mt-1 truncate text-xl font-semibold tracking-[-0.02em]">
              {detail.fullName}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(locale, detail.createdAt, true)}
            </p>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-vapor)]">
            <span className={cn('size-2 rounded-full', statusTone(detail.confirmed))} />
            {t(`ordersManager.status.${getOrderStatusLabelKey(detail.confirmed)}`)}
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

function OrdersPulse({
  overview,
  projectionBasis,
  loading,
  onProjectionBasisChange,
}: {
  overview?: DailyOrderStatusOverview;
  projectionBasis: ProfitProjectionBasis;
  loading: boolean;
  onProjectionBasisChange: (basis: ProfitProjectionBasis) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('adminWorkspace.orders');
  const overviewT = useTranslations('ordersManager.overview');
  const [activeReportIndex, setActiveReportIndex] = useState(0);

  if (!overview?.available) return null;
  const activeReport = overview.reports[activeReportIndex] ?? overview.reports[0];
  if (!activeReport) return null;

  const oldestReportIndex = overview.reports.length - 1;
  const formatReportDay = (reportDay: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: overview.timezone,
    }).format(new Date(`${reportDay}T12:00:00Z`));
  const projection = activeReport.profitProjection;
  const updates = activeReport.confirmationStatusChanges + activeReport.shipmentUpdates;
  const cancellations = activeReport.adminCancelled + activeReport.carrierCancelled;

  return (
    <section aria-label={t('weekOverview')} className="border-b border-border/60 bg-card/30 p-2.5">
      <div
        className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5"
        data-mobile-projection-controls
      >
        <div className="order-1 min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t('weekOverview')}
          </h2>
          <p className="mt-0.5 truncate text-xs font-medium capitalize">
            {formatReportDay(activeReport.reportDay)}
          </p>
        </div>
        <label className="order-3 flex w-full items-center justify-end gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground sm:order-2 sm:ms-auto sm:w-auto sm:border-0 sm:pt-0">
          <span>{overviewT('projection.confirmedBasis')}</span>
          <Switch
            checked={projectionBasis === 'posted'}
            aria-label={overviewT('projection.basisLabel')}
            onCheckedChange={(checked) => {
              setActiveReportIndex(0);
              onProjectionBasisChange(checked ? 'posted' : 'confirmed');
            }}
          />
          <span>{overviewT('projection.postedBasis')}</span>
        </label>
        <div className="order-2 ms-auto flex items-center gap-1 border-s border-border/60 ps-2 sm:order-3 sm:ms-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={activeReportIndex === 0}
            onClick={() => setActiveReportIndex(0)}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {overviewT('today')}
          </Button>
          <span className="flex items-center" dir="ltr">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              aria-label={t('nextDay')}
              disabled={activeReportIndex === 0}
              onClick={() => setActiveReportIndex((current) => Math.max(current - 1, 0))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              aria-label={t('previousDay')}
              disabled={activeReportIndex === oldestReportIndex}
              onClick={() =>
                setActiveReportIndex((current) => Math.min(current + 1, oldestReportIndex))
              }
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
      <div className="relative pb-2" data-projection-deck>
        <div
          aria-hidden="true"
          data-projection-stack-layer
          className="absolute inset-x-4 inset-y-0 translate-y-2 scale-[0.97] rounded-[0.9rem] border border-border/45 bg-background/45"
        />
        <div
          aria-hidden="true"
          data-projection-stack-layer
          className="absolute inset-x-2 inset-y-0 translate-y-1 scale-[0.985] rounded-[0.9rem] border border-border/55 bg-background/70 shadow-[var(--shadow-vapor)]"
        />
        <article
          key={activeReport.reportDay}
          aria-live="polite"
          className={cn(
            'relative z-10 overflow-hidden rounded-[0.9rem] border border-border/65 bg-background shadow-[var(--shadow-vapor-strong)] transition-opacity',
            loading && 'opacity-65',
          )}
        >
          <div className="divide-y divide-border/55 sm:hidden" data-mobile-projection-summary>
            <div className="flex items-end justify-between gap-4 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[0.68rem] text-muted-foreground">{t('projectedProfit')}</p>
                <p className="mt-0.5 truncate text-xl font-semibold tracking-[-0.02em] tabular-nums">
                  {projection ? formatMoney(locale, projection.projectedProfit) : '—'}
                </p>
              </div>
              <p className="shrink-0 pb-0.5 text-xs text-muted-foreground">
                {t('grossShort')}{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {projection ? formatMoney(locale, projection.grossProfit) : '—'}
                </span>
              </p>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border/55 rtl:divide-x-reverse">
              {[
                [t('newShort'), activeReport.newOrders],
                [t('confirmedShort'), activeReport.confirmedToday],
                [t('noAnswerShort'), activeReport.noAnswerOrders],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 px-3 py-2.5">
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                  <dt className="truncate text-[0.65rem] text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 text-xs [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground">
                  {overviewT('projection.adSpend')} · {t('updates')}
                </span>
                <span className="ms-auto font-medium tabular-nums">
                  {projection ? formatMoney(locale, projection.adSpend) : '—'} · {updates}
                </span>
                <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <dl className="grid grid-cols-2 border-t border-border/55 bg-muted/15">
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[0.65rem] text-muted-foreground">
                    {overviewT('projection.adSpend')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projection ? formatMoney(locale, projection.adSpend) : '—'}
                  </dd>
                </div>
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[0.65rem] text-muted-foreground">
                    {overviewT('projection.returnLoss')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projection ? formatMoney(locale, projection.estimatedReturnLoss) : '—'}
                  </dd>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[0.65rem] text-muted-foreground">{t('updates')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{updates}</dd>
                  <p className="truncate text-[0.62rem] text-muted-foreground">
                    {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                    {activeReport.shipmentUpdates} {t('shipmentShort')}
                  </p>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[0.65rem] text-muted-foreground">{t('cancelled')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{cancellations}</dd>
                  <p className="truncate text-[0.62rem] text-muted-foreground">
                    {activeReport.adminCancelled} {t('adminShort')} ·{' '}
                    {activeReport.carrierCancelled} {t('carrierShort')}
                  </p>
                </div>
              </dl>
            </details>
          </div>
          <div
            data-projection-summary-grid
            className="hidden gap-px bg-border/45 sm:grid sm:grid-cols-3 lg:grid-cols-[minmax(9rem,1fr)_minmax(6rem,0.65fr)_minmax(9rem,1fr)_minmax(14rem,1.55fr)_minmax(9rem,0.95fr)_minmax(8rem,0.85fr)]"
          >
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">
                {t('projectedProfit')}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-[-0.02em] tabular-nums">
                {projection ? formatMoney(locale, projection.projectedProfit) : '—'}
              </p>
              <p className="truncate text-[0.65rem] text-muted-foreground">
                {t('grossShort')} {projection ? formatMoney(locale, projection.grossProfit) : '—'}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">
                {overviewT('projection.adSpend')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projection ? formatMoney(locale, projection.adSpend) : '—'}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">
                {overviewT('projection.returnLoss')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projection ? formatMoney(locale, projection.estimatedReturnLoss) : '—'}
              </p>
              {projection ? (
                <p className="truncate text-[0.65rem] text-muted-foreground">
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                    projection.estimatedReturnRate,
                  )}
                  % ·{' '}
                  {t('expectedShort', {
                    count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                      projection.estimatedReturnedOrders,
                    ),
                  })}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">{t('ordersSummary')}</p>
              <dl className="mt-1 grid grid-cols-3 gap-2">
                {[
                  [t('newShort'), activeReport.newOrders],
                  [t('confirmedShort'), activeReport.confirmedToday],
                  [t('noAnswerShort'), activeReport.noAnswerOrders],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col">
                    <dt className="order-2 truncate text-[0.62rem] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="order-1 text-base font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">{t('updates')}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{updates}</p>
              <p className="truncate text-[0.65rem] text-muted-foreground">
                {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                {activeReport.shipmentUpdates} {t('shipmentShort')}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[0.68rem] text-muted-foreground">{t('cancelled')}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{cancellations}</p>
              <p className="truncate text-[0.65rem] text-muted-foreground">
                {activeReport.adminCancelled} {t('adminShort')} · {activeReport.carrierCancelled}{' '}
                {t('carrierShort')}
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function OrdersWorkspace({
  initialOrders,
  initialCatalog,
  initialOverview,
}: {
  initialOrders: OrdersResponse;
  initialCatalog?: EcotrackCatalogResponse;
  initialOverview?: DailyOrderStatusOverview;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [openedOrder, setOpenedOrder] = useState<OrderRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>(2);
  const [projectionBasis, setProjectionBasis] = useState<ProfitProjectionBasis>('confirmed');
  const [overviewByBasis, setOverviewByBasis] = useState<
    Partial<Record<ProfitProjectionBasis, DailyOrderStatusOverview>>
  >(() => (initialOverview ? { confirmed: initialOverview } : {}));
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const ordersQuery = useQuery({
    queryKey: ['orders-workspace', page, deferredSearch, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        search: deferredSearch,
        confirmed: statusFilter === 'all' ? '' : String(statusFilter),
      });
      return request<OrdersResponse>(`/api/orders?${params.toString()}`);
    },
    initialData:
      page === 1 && deferredSearch === '' && statusFilter === 'all' ? initialOrders : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const overviewMutation = useMutation({
    mutationFn: (basis: ProfitProjectionBasis) =>
      request<{ overview: DailyOrderStatusOverview }>(
        `/api/orders/overview?projectionBasis=${basis}&reportDays=7`,
      ),
    onSuccess: (response, basis) => {
      setOverviewByBasis((current) => ({ ...current, [basis]: response.overview }));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeProjectionBasis = (basis: ProfitProjectionBasis) => {
    setProjectionBasis(basis);
    if (!overviewByBasis[basis]) overviewMutation.mutate(basis);
  };
  const orders = ordersQuery.data?.items ?? [];
  const pagination = ordersQuery.data?.pagination;
  const writable = ordersQuery.data?.writable ?? initialOrders.writable;
  const selectedOrders = orders.filter((order) => selectedIds.includes(order.id));
  const allVisibleSelected =
    orders.length > 0 && orders.every((order) => selectedIds.includes(order.id));
  const activeOrder =
    orders.find((order) => order.id === activeOrderId) ??
    (openedOrder?.id === activeOrderId ? openedOrder : null) ??
    (activeOrderId === null ? orders[0] : null);
  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: OrderPatch }) =>
      request<OrderDetailResponse>(`/api/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: async (response) => {
      queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders-workspace'] }, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((order) =>
                order.id === response.item.id ? response.item : order,
              ),
            }
          : current,
      );
      queryClient.setQueryData(['orders-workspace-detail', response.item.id], response);
      toast.success(t('notifications.orders.status.success', { name: response.item.fullName }));
      await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveOrder = async (order: OrderRecord, patch: OrderPatch) => {
    await patchMutation.mutateAsync({ id: order.id, patch });
  };
  const bulkStatusMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selectedOrders.map((order) =>
          request<OrderDetailResponse>(`/api/orders/${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              confirmed: bulkStatus,
              noAnswerCount: bulkStatus === 1 ? Math.max(order.noAnswerCount, 1) : 0,
            }),
          }),
        ),
      );
    },
    onSuccess: async () => {
      toast.success(t('notifications.orders.bulkStatus.success', { count: selectedOrders.length }));
      setSelectedIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['orders-workspace-detail'] }),
      ]);
    },
    onError: () =>
      toast.error(t('notifications.orders.bulkStatus.error', { count: selectedOrders.length })),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteTarget) =>
      request<{ ok: true }>(`/api/orders/${id}`, { method: 'DELETE' }),
    onSuccess: async (_response, target) => {
      toast.success(t('notifications.orders.delete.success', { target: target.label }));
      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => id !== target.id));
      setActiveOrderId((current) => (current === target.id ? null : current));
      await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
    },
    onError: (_error, target) =>
      toast.error(t('notifications.orders.delete.error', { target: target.label })),
  });

  const copyTrackingLink = async (order: OrderRecord) => {
    try {
      const publicToken =
        order.publicToken ??
        (
          await request<TrackingTokenResponse>(`/api/orders/${order.id}`, {
            method: 'POST',
          })
        ).publicToken;
      const trackingUrl = buildOrderTrackingUrl(publicToken, locale);
      if (!trackingUrl) throw new Error(t('ordersManager.tracking.unavailable'));
      await navigator.clipboard.writeText(trackingUrl);
      toast.success(t('ordersManager.tracking.success'));
      if (!order.publicToken) {
        queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders-workspace'] }, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === order.id ? { ...item, publicToken } : item,
                ),
              }
            : current,
        );
      }
    } catch {
      toast.error(t('ordersManager.tracking.error'));
    }
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    setSelectedIds([]);
    setActiveOrderId(null);
    setOpenedOrder(null);
  };

  const openOrderById = async (orderId: number) => {
    const listed = orders.find((order) => order.id === orderId);
    if (listed) {
      setOpenedOrder(listed);
      setActiveOrderId(orderId);
      return;
    }
    try {
      const response = await request<OrderDetailResponse>(`/api/orders/${orderId}`);
      setOpenedOrder(response.item);
      setActiveOrderId(response.item.id);
      queryClient.setQueryData(['orders-workspace-detail', response.item.id], response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('notifications.orders.load.error'));
    }
  };

  return (
    <>
      <div className="-mx-1 overflow-hidden sm:-mx-2 lg:-mx-4" data-admin-workspace="orders">
        <OrdersPulse
          overview={overviewByBasis[projectionBasis] ?? overviewByBasis.confirmed}
          projectionBasis={projectionBasis}
          loading={overviewMutation.isPending && overviewMutation.variables === projectionBasis}
          onProjectionBasisChange={changeProjectionBasis}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3 sm:flex-nowrap">
          <label className="relative w-full min-w-0 flex-1 sm:w-auto">
            <span className="sr-only">{t('adminWorkspace.common.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              className="ps-9"
              placeholder={t('adminWorkspace.orders.searchPlaceholder')}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setSelectedIds([]);
                setActiveOrderId(null);
              }}
            />
          </label>
          <NativeSelect
            value={statusFilter}
            className={cn(
              'order-last w-full sm:order-none sm:block sm:w-56',
              mobileFiltersOpen ? 'block' : 'hidden',
            )}
            aria-label={t('ordersManager.filters.statusLabel')}
            onChange={(event) => {
              setStatusFilter(
                event.target.value === 'all' ? 'all' : (Number(event.target.value) as OrderStatus),
              );
              setPage(1);
              setSelectedIds([]);
              setActiveOrderId(null);
            }}
          >
            <NativeSelectOption value="all">
              {t('ordersManager.filters.allStatuses')}
            </NativeSelectOption>
            {statusOptions.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="me-auto text-sm text-muted-foreground sm:me-0 sm:px-2">
            {t('adminWorkspace.orders.resultCount', {
              count: ordersQuery.data?.pagination.totalItems ?? orders.length,
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant={mobileFiltersOpen || statusFilter !== 'all' ? 'default' : 'outline'}
            className="sm:hidden"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t('adminWorkspace.common.filters')}
            {statusFilter !== 'all' ? ' · 1' : ''}
          </Button>
          <OrderSalesDesk
            catalog={initialCatalog}
            writable={writable}
            onOpenOrder={(id) => void openOrderById(id)}
            onCreated={async (order) => {
              setOpenedOrder(order);
              setActiveOrderId(order.id);
              await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
            }}
          />
        </div>

        <OrdersWorkflows
          selectedOrders={selectedOrders}
          writable={writable}
          onOrdersChanged={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['orders-workspace'] }),
              queryClient.invalidateQueries({ queryKey: ['orders-workspace-detail'] }),
            ]);
          }}
        />

        <div className="grid min-h-0 lg:min-h-[680px] lg:grid-cols-[minmax(22rem,0.84fr)_minmax(28rem,1.16fr)]">
          <section
            aria-label={t('adminWorkspace.orders.queue')}
            className={cn(
              'min-w-0 border-border/60 lg:block lg:border-e',
              activeOrderId !== null && activeOrder !== null ? 'hidden' : 'block',
            )}
          >
            {ordersQuery.isError ? (
              <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {ordersQuery.error.message}
              </p>
            ) : null}
            <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-muted/[0.16] px-2 py-2">
              <label className="grid size-9 shrink-0 place-items-center">
                <span className="sr-only">{t('labels.selectAll')}</span>
                <Checkbox
                  aria-label={t('labels.selectAll')}
                  checked={allVisibleSelected}
                  onChange={(event) =>
                    setSelectedIds(event.target.checked ? orders.map((order) => order.id) : [])
                  }
                />
              </label>
              {(['all', 0, 1, 2, 11] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                    setSelectedIds([]);
                    setActiveOrderId(null);
                  }}
                  className={cn(
                    'shrink-0 rounded-[0.7rem] px-3 py-1.5 text-sm font-medium transition-colors',
                    statusFilter === status
                      ? 'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground',
                  )}
                >
                  {status === 'all'
                    ? t('adminWorkspace.common.all')
                    : t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                </button>
              ))}
            </div>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/[0.045] px-3 py-2.5">
                <span className="me-auto text-sm font-medium">
                  {t('labels.bulkSelectionCount', { count: selectedIds.length })}
                </span>
                <NativeSelect
                  aria-label={t('ordersManager.bulk.statusLabel')}
                  value={String(bulkStatus)}
                  className="min-w-40 sm:w-auto"
                  disabled={!writable || bulkStatusMutation.isPending}
                  onChange={(event) => setBulkStatus(Number(event.target.value) as OrderStatus)}
                >
                  {statusOptions
                    .filter((status) => status !== 11)
                    .map((status) => (
                      <NativeSelectOption key={status} value={status}>
                        {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <Button
                  type="button"
                  size="sm"
                  disabled={!writable || bulkStatusMutation.isPending}
                  onClick={() => bulkStatusMutation.mutate()}
                >
                  {bulkStatusMutation.isPending ? <Spinner className="size-4" /> : null}
                  {t('ordersManager.bulk.applyStatus')}
                </Button>
              </div>
            ) : null}
            <div className="divide-y divide-border/55">
              {orders.map((order) => {
                const trackingUrl = buildOrderTrackingUrl(order.publicToken, locale);
                const note = order.note?.trim();

                return (
                  <div
                    key={order.id}
                    className={cn(
                      'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 transition-colors hover:bg-primary/[0.035]',
                      activeOrderId === order.id && 'bg-primary/[0.055]',
                    )}
                  >
                    <Checkbox
                      aria-label={t('labels.selectRow', { name: order.fullName })}
                      checked={selectedIds.includes(order.id)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, order.id])]
                            : current.filter((id) => id !== order.id),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setActiveOrderId(order.id)}
                      className="min-w-0 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            statusTone(order.confirmed),
                          )}
                        />
                        <span className="truncate text-sm font-semibold">{order.fullName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">#{order.id}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {productSummary(order)} ·{' '}
                        {formatOrderRegionLabel(
                          initialCatalog,
                          order.state,
                          order.city,
                          t('adminWorkspace.orders.noLocation'),
                        )}
                      </span>
                      <span className="mt-1.5 flex min-w-0 items-center gap-3">
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatMoney(locale, order.totalAmount)}
                        </span>
                        {note ? (
                          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{note}</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5">
                      {trackingUrl ? (
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('adminWorkspace.orders.openTracking', {
                            name: order.fullName,
                          })}
                          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          <ExternalLink className="size-4" aria-hidden="true" />
                          <span className="hidden min-[390px]:inline">
                            {t('adminWorkspace.orders.tracking')}
                          </span>
                        </a>
                      ) : null}
                      <CompactActionsMenu label={`${t('labels.actions')} · ${order.fullName}`}>
                        <ActionMenuButton onClick={() => setActiveOrderId(order.id)}>
                          <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                          <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
                          {t('actions.edit')}
                        </ActionMenuButton>
                        <ActionMenuButton onClick={() => void copyTrackingLink(order)}>
                          <Copy className="size-4" aria-hidden="true" />
                          {t('ordersManager.tracking.copy')}
                        </ActionMenuButton>
                        <ActionMenuButton
                          destructive
                          disabled={!writable}
                          onClick={() => setDeleteTarget({ id: order.id, label: order.fullName })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          {t('actions.delete')}
                        </ActionMenuButton>
                      </CompactActionsMenu>
                    </div>
                  </div>
                );
              })}
            </div>
            {ordersQuery.isFetching ? (
              <div className="flex items-center justify-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t('labels.loading')}
              </div>
            ) : orders.length === 0 ? (
              <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-muted-foreground">
                {t('adminWorkspace.common.noResults')}
              </div>
            ) : null}
            {pagination && pagination.totalPages > 1 ? (
              <div className="flex flex-col gap-3 border-t border-border/60 bg-card/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('labels.pageOfTotal', {
                    page: pagination.page,
                    total: pagination.totalPages,
                  })}
                </p>
                <nav
                  aria-label={t('labels.goToPageInput')}
                  className="flex items-center justify-center gap-1"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-9 px-0"
                    aria-label={t('actions.previous')}
                    disabled={!pagination.hasPreviousPage}
                    onClick={() => changePage(Math.max(1, pagination.page - 1))}
                  >
                    <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
                    <ChevronRight className="hidden size-4 rtl:block" aria-hidden="true" />
                  </Button>
                  {getPaginationItems(pagination.page, pagination.totalPages).map((item) =>
                    typeof item === 'number' ? (
                      <Button
                        key={item}
                        type="button"
                        size="sm"
                        variant={item === pagination.page ? 'default' : 'ghost'}
                        className={cn(
                          'size-9 px-0 tabular-nums',
                          item !== 1 &&
                            item !== pagination.totalPages &&
                            Math.abs(item - pagination.page) > 1 &&
                            'hidden sm:inline-flex',
                        )}
                        aria-label={t('labels.goToPage', { page: item })}
                        aria-current={item === pagination.page ? 'page' : undefined}
                        onClick={() => changePage(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span
                        key={item}
                        aria-hidden="true"
                        className="hidden size-7 place-items-center text-sm text-muted-foreground sm:grid"
                      >
                        …
                      </span>
                    ),
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-9 px-0"
                    aria-label={t('actions.next')}
                    disabled={!pagination.hasNextPage}
                    onClick={() => changePage(Math.min(pagination.totalPages, pagination.page + 1))}
                  >
                    <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                    <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
                  </Button>
                </nav>
              </div>
            ) : null}
          </section>

          <aside
            className={cn(
              'min-w-0 bg-card/20 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto',
              activeOrderId !== null && activeOrder !== null ? 'block' : 'hidden',
            )}
          >
            <div className="border-b border-border/60 px-3 py-2 lg:hidden">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setActiveOrderId(null)}
              >
                <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
                <ChevronRight className="hidden size-4 rtl:block" aria-hidden="true" />
                {t('adminWorkspace.orders.queue')}
              </Button>
            </div>
            <OrderEditor
              order={activeOrder}
              catalog={initialCatalog}
              writable={writable}
              pending={patchMutation.isPending}
              onSave={saveOrder}
            />
          </aside>
        </div>
      </div>
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('notifications.orders.delete.confirm')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? <Spinner className="size-4" /> : null}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
