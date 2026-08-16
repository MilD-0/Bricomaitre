'use client';

/* eslint-disable @next/next/no-img-element -- Operational order thumbnails can come from legacy arbitrary origins and are not page-critical media. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Eye,
  History,
  Link2,
  Package,
  Phone,
  Save,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type SetStateAction,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { requestJson as request } from '../../lib/admin-api';
import {
  readClientStorage as readStorage,
  writeClientStorage as writeStorage,
} from '../../lib/client-storage';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import { captureQueries, restoreQueries } from '../../lib/query-cache';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import {
  buildOrderExportFileName,
  buildOrderExportRows,
  filterRecentConfirmedOrders,
} from '../../lib/order-export';
import {
  buildOrderProductSummaries,
  getDeliveryTypeLabelKey,
  getOrderFullName,
  getOrderStatusLabelKey,
  parseNumericAmount,
  type OrderPatch,
  type OrderProductSummary,
  type OrderRecord,
  type OrderSortKey,
  type OrderSortRule,
} from '../../lib/orders';
import { appendSortParams, getSortRuleState, toggleSortRule } from '../../lib/multi-sort';
import type {
  DailyOrderStatusOverview,
  DailyOrderStatusOverviewResponse,
  OrdersResponse,
  ProfitProjectionBasis,
} from '../../lib/order-admin-contracts';
import {
  buildOrderPhoneTelHref,
  formatOrderPhoneForDisplay,
  normalizeOrderPhoneForStorage,
  resolveEcotrackDeliveryFee,
} from '../../lib/order-presentation';
import { buildOrderTrackingUrl } from '../../lib/order-tracking-link';
import {
  type ShoppingListDraftItem,
  type ShoppingListSourceMode,
} from '../../lib/shopping-list-drafts';
import { DailyOrderStatusOverviewPanel } from './daily-order-status-overview';
import {
  areCartProductsEqual,
  buildEditableProducts,
  OrderProductsEditor,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
} from './order-products-editor';
import {
  EcotrackPostingDialog,
  type EcotrackPostingPreviewState,
  type EcotrackPostingSummary,
  type EcotrackPreviewResponse,
} from './orders-ecotrack-posting-dialog';
import {
  ExportOrdersDialog,
  type ExportPreviewState,
  type ExportProgressState,
} from './orders-export-dialog';
import {
  ShoppingListDialog,
  type ShoppingListSaveStatus,
  type ShoppingListState,
} from './orders-shopping-list-dialog';
import {
  buildInventoryPreview,
  buildMergedShoppingListState,
  buildShoppingListDraftUrl,
  buildShoppingListPrintHtml,
  buildShoppingListStateFromDraft,
  fetchShoppingListDraft,
  recalculateShoppingListInventory,
  saveShoppingListDraft,
  type BrandLookupResponse,
  type ProductLookupResponse,
} from './orders-shopping-list';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from '../ui/motion';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { TablePaginationControls } from '../table-pagination-controls';
import { MultiSortHeader } from '../multi-sort-header';
import { SearchField } from '../search-field';
import { SplitActionButton } from '../split-action-button';
import { ViewModeToggle, type ViewMode } from '../view-mode-toggle';

type MutationMessages = { loading: string; success: string; error: string };
type PartialOrderPatch = Partial<OrderPatch>;
type PatchMutationVariables = {
  id: number;
  values: PartialOrderPatch;
  messages: MutationMessages;
  optimisticProducts?: EditableOrderProduct[];
};
type DeleteMutationVariables = { id: number; messages: MutationMessages };

type DeleteState = { id: number; label: string } | null;
type ProductsDialogState = {
  order: OrderRecord;
  items: EditableOrderProduct[];
  search: string;
} | null;
type AddressDraft = { delivery: 0 | 1; state: string; city: string; homeAddress: string };
type OrderExportJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  fileName: string | null;
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
  errorMessage: string | null;
  downloadPath: string | null;
  resultSummary: Record<string, unknown> | null;
};
type OrderExportJobResponse = { job: OrderExportJob | null };
const DEFAULT_STOREFRONT_BASE_URL = 'https://bricomaitre.com';

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function getStorefrontBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL?.trim();
  return normalizeBaseUrl(configured || DEFAULT_STOREFRONT_BASE_URL);
}

function buildStorefrontProductHref(product: OrderProductSummary) {
  const token = product.slug ?? product.productId;
  return token ? `${getStorefrontBaseUrl()}/products/${encodeURIComponent(String(token))}` : null;
}
type OrderDetailResponse = { ok: true; item: OrderRecord };
type InventoryApplyResponse = {
  ok: true;
  items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }>;
  skipped: Array<{ productId: number; reason: string }>;
};
const ORDERS_VIEW_MODE_STORAGE_KEY = 'orders-view-mode-v1';

function updateOrderLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (order: OrderRecord) => OrderRecord | null,
) {
  queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders-table'] }, (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map(updater).filter((order): order is OrderRecord => order !== null),
    };
  });
}

function buildMessages(
  t: ReturnType<typeof useTranslations>,
  loadingKey: string,
  successKey: string,
  errorKey: string,
  values: Record<string, string | number>,
) {
  return {
    loading: t(loadingKey, values),
    success: t(successKey, values),
    error: t(errorKey, values),
  };
}

function buildProductsDialogState(order: OrderRecord) {
  return {
    order,
    items: buildEditableProducts(order),
    search: '',
  };
}

function optimisticOrder(
  order: OrderRecord,
  values: PartialOrderPatch,
  optimisticProducts?: EditableOrderProduct[],
): OrderRecord {
  const cartProducts = values.cartProducts ?? order.cartProducts;
  const orderProducts =
    values.cartProducts !== undefined
      ? optimisticProducts
        ? summarizeEditableProducts(optimisticProducts)
        : buildOrderProductSummaries(cartProducts)
      : order.orderProducts;
  const productSubtotal = orderProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const confirmed = values.confirmed ?? order.confirmed;
  const noAnswerCount =
    confirmed === 1 ? Math.max(values.noAnswerCount ?? order.noAnswerCount ?? 0, 1) : 0;
  const firstName = values.firstName !== undefined ? values.firstName : order.firstName;
  const lastName = values.lastName !== undefined ? values.lastName : order.lastName;

  return {
    ...order,
    firstName,
    lastName,
    fullName: getOrderFullName(firstName, lastName, values.phoneNumber1 ?? order.phoneNumber1),
    phoneNumber1: values.phoneNumber1 ?? order.phoneNumber1,
    note: values.note !== undefined ? values.note : order.note,
    confirmed,
    noAnswerCount,
    delivery: values.delivery ?? order.delivery,
    state: values.state !== undefined ? values.state : order.state,
    city: values.city !== undefined ? values.city : order.city,
    homeAddress: values.homeAddress !== undefined ? values.homeAddress : order.homeAddress,
    cartProducts,
    orderProducts,
    productSubtotal,
    totalAmount: productSubtotal + order.deliveryFee,
    updatedAt: new Date().toISOString(),
  };
}

function getOrderProductHoverKey(orderId: number, product: OrderProductSummary) {
  return `${orderId}:${product.productId ?? product.rawValue}`;
}

function formatOrderStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: OrderRecord['confirmed'],
) {
  const key = getOrderStatusLabelKey(status);

  return t(`ordersManager.status.${key}`);
}

function splitFullNameDraft(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const [firstName, ...rest] = normalized.split(' ');
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  };
}

function OrdersTableSkeleton() {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: 10 }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-full max-w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: 10 }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <Skeleton className="h-9 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrdersMobileSkeleton() {
  return (
    <div className="grid gap-3 px-4 pb-4 lg:hidden">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="rounded-[1.5rem] border border-border/70 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-28" />
          <Skeleton className="mt-4 h-20 w-full" />
          <Skeleton className="mt-3 h-20 w-full" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function NoAnswerCounter({
  count,
  disabled,
  onDecrease,
  onIncrease,
  compact = false,
}: {
  count: number;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  compact?: boolean;
}) {
  const t = useTranslations();

  return (
    <div
      className={`mt-2 flex items-center ${compact ? 'gap-2' : 'justify-between gap-3 rounded-xl border border-border/70 p-2'}`}
    >
      <span className="text-sm text-muted-foreground">
        {t('ordersManager.status.noAnswerCounter', { count })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || count <= 1}
          onClick={onDecrease}
          aria-label={t('ordersManager.status.decreaseNoAnswer', { count: Math.max(count - 1, 1) })}
        >
          -
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onIncrease}
          aria-label={t('ordersManager.status.increaseNoAnswer', { count: count + 1 })}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function formatOrderProductLabel(
  product: OrderProductSummary,
  formatMoney: (value: number) => string,
) {
  if (product.missing) {
    return product.quantity > 1 ? `${product.title} x${product.quantity}` : product.title;
  }

  if (product.quantity > 1) {
    return `${product.title} x${product.quantity} · ${formatMoney(product.lineTotal)}`;
  }

  return `${product.title} · ${formatMoney(product.unitPrice)}`;
}

function getCachedOrders(queryClient: ReturnType<typeof useQueryClient>) {
  const queries = queryClient.getQueriesData<OrdersResponse>({ queryKey: ['orders-table'] });
  const orders = new Map<number, OrderRecord>();

  for (const [, response] of queries) {
    response?.items.forEach((order) => orders.set(order.id, order));
  }

  return [...orders.values()];
}

function OrderProductsPreview({
  orderId,
  products,
  emptyLabel,
  hoveredProductKey,
  onHoverChange,
  formatMoney,
  limit,
}: {
  orderId: number;
  products: OrderProductSummary[];
  emptyLabel: string;
  hoveredProductKey: string | null;
  onHoverChange: Dispatch<SetStateAction<string | null>>;
  formatMoney: (value: number) => string;
  limit?: number;
}) {
  if (products.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  const visibleProducts = limit ? products.slice(0, limit) : products;

  return (
    <>
      {visibleProducts.map((product) => {
        const hoverKey = getOrderProductHoverKey(orderId, product);
        const previewVisible = hoveredProductKey === hoverKey && Boolean(product.thumbnailUrl);
        const storefrontHref = buildStorefrontProductHref(product);
        const productLabel = formatOrderProductLabel(product, formatMoney);

        return (
          <div
            key={hoverKey}
            className="relative inline-flex"
            onMouseEnter={() => onHoverChange(hoverKey)}
            onMouseLeave={() => onHoverChange((current) => (current === hoverKey ? null : current))}
          >
            {storefrontHref ? (
              <a
                href={storefrontHref}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={(event) => event.stopPropagation()}
              >
                <Badge
                  variant="outline"
                  className="max-w-full truncate hover:bg-primary/10 hover:text-primary"
                >
                  {productLabel}
                </Badge>
              </a>
            ) : (
              <Badge variant="outline" className="max-w-full truncate">
                {productLabel}
              </Badge>
            )}
            {previewVisible ? (
              <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-lg">
                <img
                  src={product.thumbnailUrl ?? ''}
                  alt={`${product.title} thumbnail`}
                  className="aspect-square w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        );
      })}
      {limit && products.length > limit ? (
        <Badge variant="outline">+{products.length - limit}</Badge>
      ) : null}
    </>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t('actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatStateValue(state: number | null) {
  return state === null ? '' : String(state);
}

function parseStateDraftValue(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeCommuneValue(
  state: number | null,
  city: string | null,
  catalog?: EcotrackCatalogResponse,
) {
  const rawCity = (city ?? '').trim();

  if (!catalog || !rawCity || state === null) {
    return rawCity;
  }

  const byId = catalog.communes.find(
    (entry) => String(entry.communeId) === rawCity && entry.wilayaId === state,
  );
  if (byId) {
    return String(byId.communeId);
  }

  const byName = catalog.communes.find(
    (entry) => entry.wilayaId === state && entry.name.toLowerCase() === rawCity.toLowerCase(),
  );
  return byName ? String(byName.communeId) : rawCity;
}

function formatRegionLabel(
  catalog: EcotrackCatalogResponse | undefined,
  state: number | string | null,
  city: string | null,
  placeholder: string,
) {
  const rawState = typeof state === 'number' ? String(state) : (state ?? '').trim();
  const rawCity = (city ?? '').trim();
  const wilayaId = Number.parseInt(rawState, 10);
  const wilayaName =
    catalog && Number.isInteger(wilayaId)
      ? catalog.wilayas.find((entry) => entry.wilayaId === wilayaId)?.name
      : undefined;
  const communeName =
    catalog && Number.isInteger(wilayaId) && rawCity
      ? (
          catalog.communes.find(
            (entry) => entry.wilayaId === wilayaId && String(entry.communeId) === rawCity,
          ) ??
          catalog.communes.find(
            (entry) =>
              entry.wilayaId === wilayaId && entry.name.toLowerCase() === rawCity.toLowerCase(),
          )
        )?.name
      : undefined;

  return (
    [wilayaName ?? rawState, communeName ?? rawCity].filter(Boolean).join(' / ') || placeholder
  );
}

function resolveCommuneForState(
  catalog: EcotrackCatalogResponse | undefined,
  stateValue: string,
  cityValue: string,
) {
  const wilayaId = Number.parseInt(stateValue, 10);
  if (!catalog || !Number.isInteger(wilayaId)) {
    return cityValue;
  }

  const communeOptions = catalog.communes.filter((entry) => entry.wilayaId === wilayaId);
  if (communeOptions.length === 0) {
    return '';
  }

  const rawCity = cityValue.trim();
  const currentCommune =
    communeOptions.find((entry) => String(entry.communeId) === rawCity) ??
    communeOptions.find((entry) => entry.name.toLowerCase() === rawCity.toLowerCase());

  return currentCommune ? String(currentCommune.communeId) : String(communeOptions[0].communeId);
}

function DetailsDialog({
  order,
  onOpenChange,
  hoveredProductKey,
  onHoverChange,
  formatMoney,
  catalog,
}: {
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
  hoveredProductKey: string | null;
  onHoverChange: Dispatch<SetStateAction<string | null>>;
  formatMoney: (value: number) => string;
  catalog?: EcotrackCatalogResponse;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['order-detail', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  const detail = detailQuery.data?.item ?? order;

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.details.title')}</DialogTitle>
          <DialogDescription>{detail?.fullName}</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.client')}
              </p>
              <p className="mt-2 font-medium">{detail.fullName}</p>
              {buildOrderPhoneTelHref(detail.phoneNumber1) ? (
                <p className="text-sm text-muted-foreground">
                  <a
                    className="underline-offset-4 hover:underline"
                    href={buildOrderPhoneTelHref(detail.phoneNumber1) ?? undefined}
                  >
                    {formatOrderPhoneForDisplay(detail.phoneNumber1)}
                  </a>
                </p>
              ) : null}
              {buildOrderPhoneTelHref(detail.phoneNumber2) ? (
                <p className="text-sm text-muted-foreground">
                  <a
                    className="underline-offset-4 hover:underline"
                    href={buildOrderPhoneTelHref(detail.phoneNumber2) ?? undefined}
                  >
                    {formatOrderPhoneForDisplay(detail.phoneNumber2)}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.date')}
              </p>
              <p className="mt-2 text-sm">{detail.createdAt}</p>
              <p className="text-sm text-muted-foreground">
                {formatOrderStatusLabel(t, detail.confirmed)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.products')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <OrderProductsPreview
                  orderId={detail.id}
                  products={detail.orderProducts}
                  emptyLabel={t('ordersManager.products.empty')}
                  hoveredProductKey={hoveredProductKey}
                  onHoverChange={onHoverChange}
                  formatMoney={formatMoney}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.address')}
              </p>
              <p className="mt-2 text-sm">
                {t(`ordersManager.delivery.${getDeliveryTypeLabelKey(detail.delivery)}`)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatRegionLabel(
                  catalog,
                  detail.state,
                  detail.city,
                  t('ordersManager.placeholders.region'),
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {detail.homeAddress || t('ordersManager.placeholders.street')}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.notes')}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.note || t('ordersManager.notes.empty')}
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProductsDialog({
  state,
  pending,
  onOpenChange,
  onSearchChange,
  onAddProduct,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveProduct,
  onSave,
}: {
  state: ProductsDialogState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onIncreaseQuantity: (rawValue: string) => void;
  onDecreaseQuantity: (rawValue: string) => void;
  onRemoveProduct: (rawValue: string) => void;
  onSave: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const selectedProducts = state ? summarizeEditableProducts(state.items) : [];
  const productSubtotal = selectedProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const totalAmount = productSubtotal + (state?.order.deliveryFee ?? 0);
  const hasChanges = state
    ? !areCartProductsEqual(
        state.items.map((item) => item.rawValue),
        state.order.cartProducts,
      )
    : false;
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'DZD',
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.products.title')}</DialogTitle>
          <DialogDescription>{state?.order.fullName}</DialogDescription>
        </DialogHeader>
        {state ? (
          <OrderProductsEditor
            customerName={state.order.fullName}
            items={state.items}
            search={state.search}
            onSearchChange={onSearchChange}
            onAddProduct={onAddProduct}
            onIncreaseQuantity={onIncreaseQuantity}
            onDecreaseQuantity={onDecreaseQuantity}
            onRemoveProduct={onRemoveProduct}
            footer={
              <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                <p>
                  {t('ordersManager.amount.subtotal')}: {formatMoney(productSubtotal)}
                </p>
                <p>
                  {t('ordersManager.amount.deliveryFee')}:{' '}
                  {formatMoney(state.order.deliveryFee ?? 0)}
                </p>
                <p className="font-semibold">
                  {t('ordersManager.amount.total')}: {formatMoney(totalAmount)}
                </p>
              </div>
            }
          />
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending || !hasChanges} onClick={onSave}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  order,
  onOpenChange,
}: {
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const historyQuery = useQuery({
    queryKey: ['order-history', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  const detail = historyQuery.data?.item ?? order;

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.history.title')}</DialogTitle>
          <DialogDescription>{detail?.fullName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {detail?.statusHistory.length ? (
            detail.statusHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge>{formatOrderStatusLabel(t, item.status)}</Badge>
                  <p className="text-xs text-muted-foreground">{item.changedAt}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.changedByName ?? item.changedBy ?? t('ordersManager.system')}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('ordersManager.history.empty')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrdersManager({
  initialOrders,
  initialCatalog,
  initialOverview,
}: {
  initialOrders?: OrdersResponse;
  initialCatalog?: EcotrackCatalogResponse;
  initialOverview?: DailyOrderStatusOverview;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortRules, setSortRules] = useState<OrderSortRule[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [noAnswerFilter, setNoAnswerFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<number, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, AddressDraft>>({});
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const [detailsOrder, setDetailsOrder] = useState<OrderRecord | null>(null);
  const [historyOrder, setHistoryOrder] = useState<OrderRecord | null>(null);
  const [productsDialog, setProductsDialog] = useState<ProductsDialogState>(null);
  const [bulkStatus, setBulkStatus] = useState<string>('2');
  const [shoppingListState, setShoppingListState] = useState<ShoppingListState>(null);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [shoppingListSaveStatus, setShoppingListSaveStatus] =
    useState<ShoppingListSaveStatus>('idle');
  const [exportPreviewState, setExportPreviewState] = useState<ExportPreviewState>(null);
  const [exportPreviewError, setExportPreviewError] = useState<string | null>(null);
  const [ecotrackPreviewState, setEcotrackPreviewState] =
    useState<EcotrackPostingPreviewState>(null);
  const [activeEcotrackJobId, setActiveEcotrackJobId] = useState<string | null>(null);
  const [hoveredProductKey, setHoveredProductKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [profitProjectionBasis, setProfitProjectionBasis] =
    useState<ProfitProjectionBasis>('confirmed');
  const [isFilterPending, startFilterTransition] = useTransition();
  const initializedExportStatusRef = useRef(false);
  const lastExportStatusKeyRef = useRef<string | null>(null);
  const initializedEcotrackStatusRef = useRef(false);
  const lastEcotrackStatusKeyRef = useRef<string | null>(null);
  const sessionStartedEcotrackJobIdsRef = useRef<Set<string>>(new Set());
  const shoppingListSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shoppingListSaveSeqRef = useRef(0);
  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredNoAnswerFilter = useDeferredValue(noAnswerFilter);
  const [initialOrdersUpdatedAt] = useState(() => (initialOrders ? Date.now() : 0));
  const [initialCatalogUpdatedAt] = useState(() => (initialCatalog ? Date.now() : 0));
  const [initialOverviewUpdatedAt] = useState(() => (initialOverview ? Date.now() : 0));
  const canUseInitialOrders =
    page === 1 &&
    deferredSearch.length === 0 &&
    deferredStatusFilter === 'all' &&
    deferredNoAnswerFilter === 'all' &&
    sortRules.length === 0;

  useEffect(() => {
    const stored = readStorage<ViewMode>(ORDERS_VIEW_MODE_STORAGE_KEY);
    if (stored === 'cards' || stored === 'table') {
      queueMicrotask(() => setViewMode(stored));
    }
  }, []);

  useEffect(
    () => () => {
      if (shoppingListSaveTimeoutRef.current) {
        clearTimeout(shoppingListSaveTimeoutRef.current);
      }
    },
    [],
  );

  const ordersQuery = useQuery({
    queryKey: [
      'orders-table',
      page,
      deferredSearch,
      deferredStatusFilter,
      deferredNoAnswerFilter,
      sortRules,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        search: deferredSearch,
        confirmed: deferredStatusFilter === 'all' ? '' : deferredStatusFilter,
      });
      if (deferredStatusFilter === '1' && deferredNoAnswerFilter !== 'all') {
        params.set('noAnswerCount', deferredNoAnswerFilter);
      }
      appendSortParams(params, sortRules);
      return request<OrdersResponse>(`/api/orders?${params.toString()}`);
    },
    initialData: canUseInitialOrders ? initialOrders : undefined,
    initialDataUpdatedAt: canUseInitialOrders ? initialOrdersUpdatedAt : undefined,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey;

      if (!Array.isArray(previousKey) || previousKey.length !== 6) {
        return undefined;
      }

      const [
        ,
        previousPage,
        previousSearch,
        previousConfirmed,
        previousNoAnswerCount,
        previousSortRules,
      ] = previousKey;
      const isPaginationOnlyChange =
        previousSearch === deferredSearch &&
        previousConfirmed === deferredStatusFilter &&
        previousNoAnswerCount === deferredNoAnswerFilter &&
        previousSortRules === sortRules &&
        previousPage !== page;

      return isPaginationOnlyChange ? keepPreviousData(previousData) : undefined;
    },
    staleTime: 60_000,
  });
  const overviewQuery = useQuery({
    queryKey: ['orders-overview', profitProjectionBasis],
    queryFn: () =>
      request<DailyOrderStatusOverviewResponse>(
        `/api/orders/overview?projectionBasis=${profitProjectionBasis}`,
      ),
    initialData:
      profitProjectionBasis === 'confirmed' && initialOverview
        ? { overview: initialOverview }
        : undefined,
    initialDataUpdatedAt:
      profitProjectionBasis === 'confirmed' && initialOverview
        ? initialOverviewUpdatedAt
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const ecotrackCatalogQuery = useQuery({
    queryKey: ['ecotrack-catalog-for-orders'],
    queryFn: () => request<EcotrackCatalogResponse>('/api/ecotrack/catalog'),
    initialData: initialCatalog,
    initialDataUpdatedAt: initialCatalogUpdatedAt,
    staleTime: 300_000,
  });
  const orderExportJobQuery = useQuery({
    queryKey: ['orders-export-job'],
    queryFn: () => request<OrderExportJobResponse>('/api/orders/export'),
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const orderEcotrackJobQuery = useQuery({
    queryKey: ['orders-ecotrack-job', activeEcotrackJobId],
    queryFn: () =>
      request<OrderExportJobResponse>(
        `/api/orders/ecotrack?jobId=${encodeURIComponent(activeEcotrackJobId ?? '')}`,
      ),
    enabled: activeEcotrackJobId !== null,
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, values }: PatchMutationVariables) =>
      request<{ ok: true; item: OrderRecord }>(`/api/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onMutate: async ({ id, values, messages, optimisticProducts }: PatchMutationVariables) => {
      await queryClient.cancelQueries({ queryKey: ['orders-table'] });
      const snapshot = captureQueries<OrdersResponse>(queryClient, ['orders-table']);
      const toastId = toast.loading(messages.loading);

      updateOrderLists(queryClient, (order) =>
        order.id === id ? optimisticOrder(order, values, optimisticProducts) : order,
      );

      return { snapshot, toastId, messages };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (response, variables, context) => {
      updateOrderLists(queryClient, (order) => (order.id === variables.id ? response.item : order));
      if (context) {
        toast.success(context.messages.success, { id: context.toastId });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      await queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteMutationVariables) =>
      request<{ ok: true }>(`/api/orders/${id}`, {
        method: 'DELETE',
      }),
    onMutate: async ({ id, messages }: DeleteMutationVariables) => {
      await queryClient.cancelQueries({ queryKey: ['orders-table'] });
      const snapshot = captureQueries<OrdersResponse>(queryClient, ['orders-table']);
      const toastId = toast.loading(messages.loading);

      updateOrderLists(queryClient, (order) => (order.id === id ? null : order));

      return { snapshot, toastId, messages };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_response, variables, context) => {
      setSelectedIds((current) => current.filter((id) => id !== variables.id));
      setDeleteState(null);
      if (context) {
        toast.success(context.messages.success, { id: context.toastId });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      await queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
    },
  });
  const startOrderExportMutation = useMutation<
    OrderExportJobResponse,
    Error,
    { mode: 'selected' | 'confirmed'; orderIds: number[] },
    { toastId: string }
  >({
    mutationFn: (payload) =>
      request<OrderExportJobResponse>('/api/orders/export', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onMutate: () => ({ toastId: toast.loading(t('ordersManager.export.loading')) }),
    onError: (error, _variables, context) => {
      setExportPreviewError(error.message || t('ordersManager.export.error'));
      if (context?.toastId) {
        toast.dismiss(context.toastId);
      }
    },
    onSuccess: async (_data, _variables, context) => {
      setExportPreviewError(null);
      toast.success(t('ordersManager.export.ready'), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['orders-export-job'] });
    },
  });
  const cancelOrderExportMutation = useMutation<OrderExportJobResponse, Error, void>({
    mutationFn: () =>
      request<OrderExportJobResponse>('/api/orders/export', {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-export-job'] });
    },
  });
  const previewOrderEcotrackMutation = useMutation<
    EcotrackPreviewResponse,
    Error,
    { mode: 'selected' | 'confirmed'; provider?: 'delivro' | 'emir'; orderIds: number[] },
    { toastId: string }
  >({
    mutationFn: (payload) =>
      request<EcotrackPreviewResponse>('/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onMutate: () => ({ toastId: toast.loading(t('ordersManager.ecotrack.loading')) }),
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersManager.ecotrack.error'), { id: context?.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      toast.success(t('ordersManager.ecotrack.ready'), { id: context?.toastId });
    },
  });
  const startOrderEcotrackMutation = useMutation<
    OrderExportJobResponse,
    Error,
    { mode: 'selected' | 'confirmed'; provider?: 'delivro' | 'emir'; orderIds: number[] },
    { toastId: string }
  >({
    mutationFn: (payload) =>
      request<OrderExportJobResponse>('/api/orders/ecotrack', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onMutate: () => ({ toastId: toast.loading(t('ordersManager.ecotrack.loading')) }),
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersManager.ecotrack.error'), { id: context?.toastId });
    },
    onSuccess: async (data, _variables, context) => {
      toast.success(t('ordersManager.ecotrack.ready'), { id: context?.toastId });
      const jobId = data.job?.id ?? null;
      setActiveEcotrackJobId(jobId);
      if (jobId) {
        sessionStartedEcotrackJobIdsRef.current.add(jobId);
      }
      await queryClient.invalidateQueries({ queryKey: ['orders-ecotrack-job'] });
    },
  });
  const cancelOrderEcotrackMutation = useMutation<OrderExportJobResponse, Error, void>({
    mutationFn: () =>
      request<OrderExportJobResponse>('/api/orders/ecotrack', {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-ecotrack-job'] });
    },
  });
  const addShoppingListProductMutation = useMutation<
    { product: ProductLookupResponse['item']; brandName: string },
    Error,
    ProductSearchItem
  >({
    mutationFn: async (product) => {
      const detail = await request<ProductLookupResponse>(`/api/products/${product.id}`);
      const brandId = detail.item.brandId ?? null;
      const brandName =
        brandId === null
          ? 'Unbranded'
          : (await request<BrandLookupResponse>(`/api/brands/${brandId}`)).name;

      return { product: detail.item, brandName };
    },
  });
  const applyShoppingListInventoryMutation = useMutation<
    InventoryApplyResponse,
    Error,
    {
      items: Array<{
        productId: number;
        quantity: number;
        source: { type: 'shopping-list'; orderIds: number[] };
      }>;
    }
  >({
    mutationFn: ({ items }) =>
      request<InventoryApplyResponse>('/api/inventory/apply', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'decrease',
          items,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-table'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
  const totalPages = ordersQuery.data?.pagination?.totalPages ?? 1;
  const currentPage = ordersQuery.data?.pagination?.page ?? page;
  const totalOrders = ordersQuery.data?.pagination?.totalItems ?? 0;
  const paginatedOrders = ordersQuery.data?.items ?? [];
  const selectedOrders = useMemo(
    () => getCachedOrders(queryClient).filter((order) => selectedIds.includes(order.id)),
    [queryClient, selectedIds],
  );
  const allSelected =
    paginatedOrders.length > 0 && paginatedOrders.every((order) => selectedIds.includes(order.id));
  const writable = ordersQuery.data?.writable ?? false;
  const orderExportJob = orderExportJobQuery.data.job;
  const orderEcotrackJob = orderEcotrackJobQuery.data.job;
  const exportProgressState: ExportProgressState =
    orderExportJob && (orderExportJob.status === 'queued' || orderExportJob.status === 'running')
      ? {
          phase: orderExportJob.progress.phase,
          current: orderExportJob.progress.current,
          total: orderExportJob.progress.total,
        }
      : null;
  const ecotrackProgressState: ExportProgressState =
    orderEcotrackJob &&
    (orderEcotrackJob.status === 'queued' || orderEcotrackJob.status === 'running')
      ? {
          phase: orderEcotrackJob.progress.phase,
          current: orderEcotrackJob.progress.current,
          total: orderEcotrackJob.progress.total,
        }
      : null;
  const ecotrackPostingSummary =
    (orderEcotrackJob?.resultSummary as EcotrackPostingSummary | null | undefined) ?? null;
  const isInitialLoading = !ordersQuery.data && ordersQuery.isPending;
  const showRefreshingProgress = ordersQuery.isFetching && !isInitialLoading;

  function shouldAnnounceEcotrackJob(job: OrderExportJob | null) {
    return Boolean(job?.id && sessionStartedEcotrackJobIdsRef.current.has(job.id));
  }

  useEffect(() => {
    if (!ordersQuery.isFetching && page !== currentPage) {
      queueMicrotask(() => setPage(currentPage));
    }
  }, [currentPage, page, ordersQuery.isFetching]);

  useEffect(() => {
    const statusKey = orderExportJob ? `${orderExportJob.id}:${orderExportJob.status}` : null;

    if (!initializedExportStatusRef.current) {
      initializedExportStatusRef.current = true;
      lastExportStatusKeyRef.current = statusKey;
      return;
    }

    if (!statusKey || statusKey === lastExportStatusKeyRef.current) {
      return;
    }

    lastExportStatusKeyRef.current = statusKey;
    if (!orderExportJob) {
      return;
    }

    if (orderExportJob.status === 'completed') {
      queueMicrotask(() => setExportPreviewError(null));
      toast.success(t('ordersManager.export.success'));
      if (orderExportJob.downloadPath) {
        window.open(orderExportJob.downloadPath, '_self');
      }
      queueMicrotask(() => setExportPreviewState(null));
      void queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
    } else if (orderExportJob.status === 'cancelled') {
      toast.success(t('products.exportAll.notifications.status.cancelled'));
    } else if (orderExportJob.status === 'failed') {
      queueMicrotask(() =>
        setExportPreviewError(orderExportJob.errorMessage || t('ordersManager.export.error')),
      );
    }
  }, [orderExportJob, queryClient, t]);

  useEffect(() => {
    const statusKey = orderEcotrackJob ? `${orderEcotrackJob.id}:${orderEcotrackJob.status}` : null;

    if (!initializedEcotrackStatusRef.current) {
      initializedEcotrackStatusRef.current = true;
      lastEcotrackStatusKeyRef.current = statusKey;
      return;
    }

    if (!statusKey || statusKey === lastEcotrackStatusKeyRef.current) {
      return;
    }

    lastEcotrackStatusKeyRef.current = statusKey;
    if (!orderEcotrackJob) {
      return;
    }

    if (!shouldAnnounceEcotrackJob(orderEcotrackJob)) {
      return;
    }

    if (orderEcotrackJob.status === 'completed') {
      toast.success(t('ordersManager.ecotrack.success'));
      void queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      void queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
      sessionStartedEcotrackJobIdsRef.current.delete(orderEcotrackJob.id);
    } else if (orderEcotrackJob.status === 'cancelled') {
      toast.success(t('ordersManager.ecotrack.cancelled'));
      sessionStartedEcotrackJobIdsRef.current.delete(orderEcotrackJob.id);
    } else if (orderEcotrackJob.status === 'failed') {
      toast.error(orderEcotrackJob.errorMessage || t('ordersManager.ecotrack.error'));
      sessionStartedEcotrackJobIdsRef.current.delete(orderEcotrackJob.id);
    }
  }, [orderEcotrackJob, queryClient, t]);

  function toggleSort(nextKey: OrderSortKey) {
    startFilterTransition(() => {
      setPage(1);
      setSortRules((current) => toggleSortRule(current, nextKey, 'asc'));
    });
  }

  const formatDateParts = (value: string) => {
    const date = new Date(value);

    return {
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date),
      time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date),
    };
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'DZD',
      maximumFractionDigits: 2,
    }).format(value);

  const getPhoneDraft = (order: OrderRecord) =>
    phoneDrafts[order.id] ?? formatOrderPhoneForDisplay(order.phoneNumber1);
  const getNameDraft = (order: OrderRecord) => nameDrafts[order.id] ?? order.fullName;
  const getNoteDraft = (order: OrderRecord) => noteDrafts[order.id] ?? order.note ?? '';
  const getAddressDraft = (order: OrderRecord): AddressDraft =>
    addressDrafts[order.id] ?? {
      delivery: order.delivery,
      state: formatStateValue(order.state),
      city: normalizeCommuneValue(order.state, order.city, ecotrackCatalogQuery.data),
      homeAddress: order.homeAddress ?? '',
    };

  async function saveName(order: OrderRecord) {
    const normalizedValue = getNameDraft(order).trim().replace(/\s+/g, ' ');
    if (!normalizedValue || normalizedValue === order.fullName) {
      setNameDrafts((current) => ({ ...current, [order.id]: order.fullName }));
      return;
    }

    const nextName = splitFullNameDraft(normalizedValue);
    await patchMutation.mutateAsync({
      id: order.id,
      values: {
        firstName: nextName.firstName,
        lastName: nextName.lastName,
      },
      messages: buildMessages(
        t,
        'notifications.orders.name.loading',
        'notifications.orders.name.success',
        'notifications.orders.name.error',
        { name: order.fullName },
      ),
    });
  }

  async function savePhone(order: OrderRecord) {
    const displayValue = getPhoneDraft(order).trim();
    const normalizedValue = normalizeOrderPhoneForStorage(displayValue);
    if (!normalizedValue || normalizedValue === order.phoneNumber1) {
      setPhoneDrafts((current) => ({
        ...current,
        [order.id]: formatOrderPhoneForDisplay(order.phoneNumber1),
      }));
      return;
    }

    await patchMutation.mutateAsync({
      id: order.id,
      values: { phoneNumber1: normalizedValue },
      messages: buildMessages(
        t,
        'notifications.orders.phone.loading',
        'notifications.orders.phone.success',
        'notifications.orders.phone.error',
        { name: order.fullName },
      ),
    });
  }

  async function saveNote(order: OrderRecord) {
    const value = getNoteDraft(order).trim();
    const nextValue = value.length === 0 ? null : value;
    if ((order.note ?? null) === nextValue) {
      return;
    }

    await patchMutation.mutateAsync({
      id: order.id,
      values: { note: nextValue },
      messages: buildMessages(
        t,
        'notifications.orders.note.loading',
        'notifications.orders.note.success',
        'notifications.orders.note.error',
        { name: order.fullName },
      ),
    });
  }

  async function saveAddress(order: OrderRecord) {
    const draft = getAddressDraft(order);
    if (
      draft.delivery === order.delivery &&
      draft.state === formatStateValue(order.state) &&
      draft.city === (order.city ?? '') &&
      draft.homeAddress === (order.homeAddress ?? '')
    ) {
      return;
    }

    await patchMutation.mutateAsync({
      id: order.id,
      values: {
        delivery: draft.delivery,
        state: parseStateDraftValue(draft.state),
        city: draft.city.trim() || null,
        homeAddress: draft.homeAddress.trim() || null,
      },
      messages: buildMessages(
        t,
        'notifications.orders.address.loading',
        'notifications.orders.address.success',
        'notifications.orders.address.error',
        { name: order.fullName },
      ),
    });
    setAddressDrafts((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  }

  async function saveProducts() {
    if (!productsDialog) {
      return;
    }

    const values = productsDialog.items.map((item) => item.rawValue.trim()).filter(Boolean);

    if (areCartProductsEqual(values, productsDialog.order.cartProducts)) {
      setProductsDialog(null);
      return;
    }

    await patchMutation.mutateAsync({
      id: productsDialog.order.id,
      values: { cartProducts: values },
      optimisticProducts: productsDialog.items,
      messages: buildMessages(
        t,
        'notifications.orders.products.loading',
        'notifications.orders.products.success',
        'notifications.orders.products.error',
        { name: productsDialog.order.fullName },
      ),
    });
    setProductsDialog(null);
  }

  function updateProductsDialogItems(
    updater: (items: EditableOrderProduct[]) => EditableOrderProduct[],
  ) {
    setProductsDialog((current) =>
      current ? { ...current, items: updater(current.items) } : current,
    );
  }

  function addProductToDialog(product: ProductSearchItem) {
    updateProductsDialogItems((items) => [
      ...items,
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
  }

  function increaseProductQuantity(rawValue: string) {
    updateProductsDialogItems((items) => {
      const existing = items.find((item) => item.rawValue === rawValue);
      return existing ? [...items, existing] : items;
    });
  }

  function decreaseProductQuantity(rawValue: string) {
    updateProductsDialogItems((items) => {
      const index = items.findIndex((item) => item.rawValue === rawValue);
      if (index === -1) {
        return items;
      }

      return items.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function removeProduct(rawValue: string) {
    updateProductsDialogItems((items) => items.filter((item) => item.rawValue !== rawValue));
  }

  async function handleCopyPhone(order: OrderRecord) {
    try {
      await navigator.clipboard.writeText(getPhoneDraft(order));
      toast.success(t('ordersManager.copy.success'));
    } catch {
      toast.error(t('ordersManager.copy.error'));
    }
  }

  async function handleCopyTrackingLink(order: OrderRecord) {
    let publicToken = order.publicToken;
    if (!publicToken) {
      try {
        const response = await request<{ ok: true; publicToken: string }>(
          `/api/orders/${order.id}`,
          { method: 'POST' },
        );
        publicToken = response.publicToken;
        updateOrderLists(queryClient, (current) =>
          current.id === order.id ? { ...current, publicToken } : current,
        );
      } catch {
        toast.error(t('ordersManager.tracking.unavailable'));
        return;
      }
    }

    const trackingUrl = buildOrderTrackingUrl(publicToken, locale);
    if (!trackingUrl) {
      toast.error(t('ordersManager.tracking.unavailable'));
      return;
    }

    try {
      await navigator.clipboard.writeText(trackingUrl);
      toast.success(t('ordersManager.tracking.success'));
    } catch {
      toast.error(t('ordersManager.tracking.error'));
    }
  }

  function updateOrderStatus(
    order: OrderRecord,
    confirmed: OrderRecord['confirmed'],
    noAnswerCount?: number,
  ) {
    patchMutation.mutate({
      id: order.id,
      values: {
        confirmed,
        ...(confirmed === 1
          ? { noAnswerCount: Math.max(noAnswerCount ?? order.noAnswerCount ?? 0, 1) }
          : { noAnswerCount: 0 }),
      },
      messages: buildMessages(
        t,
        'notifications.orders.status.loading',
        'notifications.orders.status.success',
        'notifications.orders.status.error',
        { name: order.fullName },
      ),
    });
  }

  async function applyBulkStatus() {
    const confirmed = Number.parseInt(bulkStatus, 10) as OrderRecord['confirmed'];
    const orders = selectedOrders;

    if (orders.length === 0) {
      return;
    }

    const toastId = toast.loading(
      t('notifications.orders.bulkStatus.loading', { count: orders.length }),
    );

    try {
      await Promise.all(
        orders.map((order) =>
          request<{ ok: true; item: OrderRecord }>(`/api/orders/${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              confirmed,
              ...(confirmed === 1
                ? { noAnswerCount: Math.max(order.noAnswerCount, 1) }
                : { noAnswerCount: 0 }),
            }),
          }),
        ),
      );

      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      await queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
      toast.success(t('notifications.orders.bulkStatus.success', { count: orders.length }), {
        id: toastId,
      });
      setSelectedIds([]);
    } catch {
      toast.error(t('notifications.orders.bulkStatus.error', { count: orders.length }), {
        id: toastId,
      });
    }
  }

  async function saveShoppingListDraftNow(nextState: NonNullable<ShoppingListState>) {
    if (shoppingListSaveTimeoutRef.current) {
      clearTimeout(shoppingListSaveTimeoutRef.current);
      shoppingListSaveTimeoutRef.current = null;
    }

    const saveSeq = shoppingListSaveSeqRef.current + 1;
    shoppingListSaveSeqRef.current = saveSeq;
    setShoppingListSaveStatus('saving');

    try {
      const response = await saveShoppingListDraft(nextState);
      if (shoppingListSaveSeqRef.current === saveSeq) {
        setShoppingListSaveStatus('saved');
      }
      setShoppingListState((current) =>
        current && current.scopeKey === response.draft.scopeKey
          ? {
              ...current,
              updatedAt: response.draft.updatedAt,
              updatedByName: response.draft.updatedByName,
            }
          : current,
      );
      return response;
    } catch {
      if (shoppingListSaveSeqRef.current === saveSeq) {
        setShoppingListSaveStatus('error');
      }
      throw new Error('Unable to save shopping list draft');
    }
  }

  function scheduleShoppingListDraftSave(nextState: NonNullable<ShoppingListState>) {
    if (shoppingListSaveTimeoutRef.current) {
      clearTimeout(shoppingListSaveTimeoutRef.current);
    }

    setShoppingListSaveStatus('saving');
    shoppingListSaveTimeoutRef.current = setTimeout(() => {
      void saveShoppingListDraftNow(nextState).catch(() => {
        toast.error(t('ordersManager.shoppingList.saveError'));
      });
    }, 400);
  }

  async function openCachedShoppingListDraft(
    sourceMode: ShoppingListSourceMode,
    orderIds: readonly number[],
    title: string,
  ) {
    const response = await fetchShoppingListDraft(sourceMode, orderIds);
    if (!response.draft) {
      return false;
    }

    setShoppingListState(buildShoppingListStateFromDraft(response.draft, title));
    setShoppingListSaveStatus('idle');
    setShoppingListOpen(true);
    return true;
  }

  async function openShoppingListForOrders(orders: OrderRecord[], title: string) {
    if (orders.length === 0) {
      toast.error(t('ordersManager.shoppingList.emptySelection'));
      return;
    }

    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));

    try {
      const orderIds = orders.map((order) => order.id);
      if (await openCachedShoppingListDraft('selected', orderIds, title)) {
        toast.success(t('ordersManager.shoppingList.sharedDraftLoaded'), { id: toastId });
        return;
      }

      const { state: nextState, loadedSharedDraft } = await buildMergedShoppingListState(
        orders,
        'selected',
        title,
      );
      setShoppingListState(nextState);
      setShoppingListSaveStatus('idle');
      setShoppingListOpen(true);
      toast.success(
        t(
          loadedSharedDraft
            ? 'ordersManager.shoppingList.sharedDraftLoaded'
            : 'ordersManager.shoppingList.ready',
        ),
        { id: toastId },
      );
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function fetchOrdersByStatus(status: OrderRecord['confirmed']) {
    const items: OrderRecord[] = [];
    let nextPage = 1;
    let totalPagesForStatus = 1;

    do {
      const response = await request<OrdersResponse>(
        `/api/orders?page=${nextPage}&limit=100&confirmed=${status}&search=&sortKey=createdAt&sortDirection=desc`,
      );
      items.push(...response.items);
      totalPagesForStatus = response.pagination.totalPages;
      nextPage += 1;
    } while (nextPage <= totalPagesForStatus);

    return items;
  }

  const shoppingListStatusConfig: Record<
    Exclude<ShoppingListSourceMode, 'selected'>,
    {
      statuses: Array<OrderRecord['confirmed']>;
      titleKey: string;
      emptyKey: string;
    }
  > = {
    confirmed: {
      statuses: [2],
      titleKey: 'ordersManager.shoppingList.confirmedTitle',
      emptyKey: 'ordersManager.shoppingList.emptyConfirmed',
    },
    dispatched: {
      statuses: [3],
      titleKey: 'ordersManager.shoppingList.dispatchedTitle',
      emptyKey: 'ordersManager.shoppingList.emptyDispatched',
    },
    posted: {
      statuses: [11],
      titleKey: 'ordersManager.shoppingList.postedTitle',
      emptyKey: 'ordersManager.shoppingList.emptyPosted',
    },
    'posted-and-confirmed': {
      statuses: [11, 2],
      titleKey: 'ordersManager.shoppingList.postedAndConfirmedTitle',
      emptyKey: 'ordersManager.shoppingList.emptyPostedAndConfirmed',
    },
  };

  async function fetchOrdersForShoppingListSource(
    sourceMode: Exclude<ShoppingListSourceMode, 'selected'>,
  ) {
    const config = shoppingListStatusConfig[sourceMode];
    const batches = await Promise.all(config.statuses.map((status) => fetchOrdersByStatus(status)));
    const seen = new Set<number>();
    return batches.flat().filter((order) => {
      if (seen.has(order.id)) {
        return false;
      }

      seen.add(order.id);
      return true;
    });
  }

  async function openStatusBasedShoppingList(
    sourceMode: Exclude<ShoppingListSourceMode, 'selected'>,
  ) {
    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));
    const config = shoppingListStatusConfig[sourceMode];

    try {
      const title = t(config.titleKey);

      if (await openCachedShoppingListDraft(sourceMode, [], title)) {
        toast.success(t('ordersManager.shoppingList.sharedDraftLoaded'), { id: toastId });
        return;
      }

      const items = await fetchOrdersForShoppingListSource(sourceMode);

      if (items.length === 0) {
        toast.error(t(config.emptyKey), { id: toastId });
        return;
      }

      const { state: nextState, loadedSharedDraft } = await buildMergedShoppingListState(
        items,
        sourceMode,
        title,
      );
      setShoppingListState(nextState);
      setShoppingListSaveStatus('idle');
      setShoppingListOpen(true);
      toast.success(
        t(
          loadedSharedDraft
            ? 'ordersManager.shoppingList.sharedDraftLoaded'
            : 'ordersManager.shoppingList.ready',
        ),
        { id: toastId },
      );
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function openConfirmedShoppingList() {
    await openStatusBasedShoppingList('confirmed');
  }

  async function openDispatchedShoppingList() {
    await openStatusBasedShoppingList('dispatched');
  }

  async function openPostedShoppingList() {
    await openStatusBasedShoppingList('posted');
  }

  async function openPostedAndConfirmedShoppingList() {
    await openStatusBasedShoppingList('posted-and-confirmed');
  }

  function openExportPreview(orders: OrderRecord[], mode: 'selected' | 'confirmed', title: string) {
    if (orders.length === 0) {
      toast.error(t('ordersManager.export.empty'));
      return;
    }

    setExportPreviewError(null);
    setExportPreviewState({
      mode,
      title,
      fileName: buildOrderExportFileName(mode),
      orders,
      rows: buildOrderExportRows(orders, ecotrackCatalogQuery.data),
    });
  }

  async function openSelectedOrdersExportPreview() {
    openExportPreview(
      selectedOrders,
      'selected',
      t('ordersManager.export.selectedTitle', { count: selectedOrders.length }),
    );
  }

  async function openConfirmedOrdersExportPreview() {
    const toastId = toast.loading(t('ordersManager.export.loading'));

    try {
      const orders = filterRecentConfirmedOrders(await fetchOrdersByStatus(2));
      if (orders.length === 0) {
        toast.error(t('ordersManager.export.emptyConfirmed'), { id: toastId });
        return;
      }

      openExportPreview(
        orders,
        'confirmed',
        t('ordersManager.export.confirmedTitle', { count: orders.length }),
      );
      toast.success(t('ordersManager.export.ready'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.export.error'), { id: toastId });
    }
  }

  async function confirmExport() {
    if (!exportPreviewState) {
      return;
    }

    try {
      setExportPreviewError(null);
      await startOrderExportMutation.mutateAsync({
        mode: exportPreviewState.mode,
        orderIds: exportPreviewState.orders.map((order) => order.id),
      });
    } catch {
      // Error state is rendered inside the export preview dialog.
    }
  }

  async function openEcotrackPreview(
    mode: 'selected' | 'confirmed',
    provider: 'delivro' | 'emir',
    orderIds: number[],
    title: string,
  ) {
    if (orderIds.length === 0) {
      toast.error(t('ordersManager.ecotrack.empty'));
      return;
    }

    try {
      const preview = await previewOrderEcotrackMutation.mutateAsync({
        mode,
        ...(provider === 'emir' ? { provider } : {}),
        orderIds,
      });
      setActiveEcotrackJobId(null);
      setEcotrackPreviewState({ mode, provider, title, orderIds, preview });
    } catch {
      toast.error(t('ordersManager.ecotrack.error'));
    }
  }

  async function openSelectedOrdersEcotrackPreview(provider: 'delivro' | 'emir') {
    await openEcotrackPreview(
      'selected',
      provider,
      selectedOrders.map((order) => order.id),
      provider === 'delivro'
        ? t('ordersManager.ecotrack.selectedTitle', { count: selectedOrders.length })
        : t('ordersManager.ecotrack.emirSelectedTitle', { count: selectedOrders.length }),
    );
  }

  async function openConfirmedOrdersEcotrackPreview(provider: 'delivro' | 'emir') {
    const orders = await fetchOrdersByStatus(2);
    if (orders.length === 0) {
      toast.error(t('ordersManager.ecotrack.emptyConfirmed'));
      return;
    }
    await openEcotrackPreview(
      'confirmed',
      provider,
      orders.map((order) => order.id),
      provider === 'delivro'
        ? t('ordersManager.ecotrack.confirmedTitle', { count: orders.length })
        : t('ordersManager.ecotrack.emirConfirmedTitle', { count: orders.length }),
    );
  }

  async function confirmEcotrackPosting() {
    if (!ecotrackPreviewState) {
      return;
    }

    try {
      const response = await startOrderEcotrackMutation.mutateAsync({
        mode: ecotrackPreviewState.mode,
        ...(ecotrackPreviewState.provider === 'emir' ? { provider: 'emir' as const } : {}),
        orderIds: ecotrackPreviewState.orderIds,
      });
      if (response.job?.id) {
        setActiveEcotrackJobId(response.job.id);
      }
    } catch {
      toast.error(t('ordersManager.ecotrack.error'));
    }
  }

  function openShoppingListPrintView() {
    if (!shoppingListState) {
      return;
    }

    const printWindow = window.open('about:blank', '_blank');
    if (!printWindow) {
      toast.error(t('ordersManager.shoppingList.printError'));
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildShoppingListPrintHtml(
        shoppingListState,
        locale,
        t('ordersManager.shoppingList.previousGeneration'),
      ),
    );
    printWindow.document.close();
  }

  function handleShoppingListOpenChange(open: boolean) {
    if (!open && shoppingListState && shoppingListSaveTimeoutRef.current) {
      void saveShoppingListDraftNow(shoppingListState).catch(() => {
        toast.error(t('ordersManager.shoppingList.saveError'));
      });
    }

    setShoppingListOpen(open);
  }

  function updateShoppingListState(
    updater: (state: NonNullable<ShoppingListState>) => NonNullable<ShoppingListState>,
    options?: { persist?: boolean },
  ) {
    setShoppingListState((current) => {
      if (!current) {
        return current;
      }

      const nextState = updater(current);
      if (options?.persist) {
        scheduleShoppingListDraftSave(nextState);
      }
      return nextState;
    });
  }

  function updateShoppingListDraftItems(
    updater: (items: ShoppingListDraftItem[]) => ShoppingListDraftItem[],
  ) {
    updateShoppingListState(
      (current) => ({ ...current, draftItems: updater(current.draftItems) }),
      { persist: true },
    );
  }

  async function resetShoppingListDraft() {
    if (!shoppingListState) {
      return;
    }

    if (shoppingListSaveTimeoutRef.current) {
      clearTimeout(shoppingListSaveTimeoutRef.current);
      shoppingListSaveTimeoutRef.current = null;
    }

    try {
      await request<{ ok: true }>(
        buildShoppingListDraftUrl(shoppingListState.sourceMode, shoppingListState.orderIds),
        { method: 'DELETE' },
      );
      setShoppingListState((current) =>
        current
          ? {
              ...current,
              draftItems: current.generatedItems.map((item) => ({
                ...item,
                notes: [...item.notes],
                checked: false,
              })),
              search: '',
              updatedAt: null,
              updatedByName: null,
            }
          : current,
      );
      setShoppingListSaveStatus('idle');
    } catch {
      toast.error(t('ordersManager.shoppingList.saveError'));
      setShoppingListSaveStatus('error');
    }
  }

  async function refreshShoppingListDraft() {
    if (!shoppingListState) {
      return;
    }

    const toastId = toast.loading(t('ordersManager.shoppingList.refreshing'));

    try {
      const orders =
        shoppingListState.sourceMode === 'selected'
          ? getCachedOrders(queryClient).filter((order) =>
              shoppingListState.orderIds.includes(order.id),
            )
          : await fetchOrdersForShoppingListSource(shoppingListState.sourceMode);

      if (orders.length === 0) {
        toast.error(t('ordersManager.shoppingList.emptySelection'), { id: toastId });
        return;
      }

      const { state: nextState } = await buildMergedShoppingListState(
        orders,
        shoppingListState.sourceMode,
        shoppingListState.title,
      );
      setShoppingListState(nextState);
      setShoppingListOpen(true);
      await saveShoppingListDraftNow(nextState);
      toast.success(t('ordersManager.shoppingList.refreshReady'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  function toggleShoppingListItem(draftId: string) {
    updateShoppingListDraftItems((items) =>
      items.map((item) => (item.draftId === draftId ? { ...item, checked: !item.checked } : item)),
    );
  }

  function increaseShoppingListItemQuantity(draftId: string) {
    updateShoppingListDraftItems((items) =>
      items.map((item) =>
        item.draftId === draftId
          ? recalculateShoppingListInventory(item, { quantity: item.quantity + 1 })
          : item,
      ),
    );
  }

  function decreaseShoppingListItemQuantity(draftId: string) {
    updateShoppingListDraftItems((items) =>
      items.map((item) =>
        item.draftId === draftId && item.quantity > 1
          ? recalculateShoppingListInventory(item, { quantity: item.quantity - 1 })
          : item,
      ),
    );
  }

  function increaseShoppingListInventoryDecrease(draftId: string) {
    updateShoppingListDraftItems((items) =>
      items.map((item) => {
        if (item.draftId !== draftId) {
          return item;
        }

        const maxDecrease = Math.min(item.quantity, item.inventoryQuantity ?? 0);
        return {
          ...item,
          inventoryDecreaseQuantity: Math.min(item.inventoryDecreaseQuantity + 1, maxDecrease),
          inventoryShortageQuantity: Math.max(
            item.quantity - Math.min(item.inventoryDecreaseQuantity + 1, maxDecrease),
            0,
          ),
        };
      }),
    );
  }

  function decreaseShoppingListInventoryDecrease(draftId: string) {
    updateShoppingListDraftItems((items) =>
      items.map((item) =>
        item.draftId === draftId
          ? {
              ...item,
              inventoryDecreaseQuantity: Math.max(item.inventoryDecreaseQuantity - 1, 0),
              inventoryShortageQuantity: Math.max(
                item.quantity - Math.max(item.inventoryDecreaseQuantity - 1, 0),
                0,
              ),
            }
          : item,
      ),
    );
  }

  function removeShoppingListItem(draftId: string) {
    updateShoppingListDraftItems((items) => items.filter((item) => item.draftId !== draftId));
  }

  async function addProductToShoppingList(product: ProductSearchItem) {
    try {
      const { product: detail, brandName } =
        await addShoppingListProductMutation.mutateAsync(product);
      updateShoppingListState(
        (current) => {
          const existing = current.draftItems.find((item) => item.productId === detail.id);
          if (existing) {
            return {
              ...current,
              search: '',
              draftItems: current.draftItems.map((item) =>
                item.productId === detail.id ? { ...item, quantity: item.quantity + 1 } : item,
              ),
            };
          }

          const nextItem: ShoppingListDraftItem = {
            draftId: `custom:${detail.id}`,
            productId: detail.id,
            brandId: detail.brandId ?? null,
            brandName: detail.brandId == null ? t('labels.noBrand') : brandName,
            title: detail.title ?? product.title,
            quantity: 1,
            unitPrice:
              detail.price == null
                ? parseNumericAmount(product.price)
                : parseNumericAmount(detail.price),
            purchasePrice:
              detail.purchasePrice == null ? null : parseNumericAmount(detail.purchasePrice),
            thumbnailUrl: detail.images?.[0] ?? product.images[0] ?? null,
            inventoryQuantity: detail.inventoryQuantity,
            ...buildInventoryPreview(1, detail.inventoryQuantity),
            notes: [],
            checked: false,
            isCustom: true,
            generatedAt: new Date().toISOString(),
          };

          return {
            ...current,
            search: '',
            draftItems: [...current.draftItems, nextItem],
          };
        },
        { persist: true },
      );
    } catch {
      toast.error(t('ordersManager.shoppingList.addProductError'));
    }
  }

  async function applyShoppingListInventoryChanges(mode: 'all' | 'selected') {
    if (!shoppingListState) {
      return;
    }

    const selectedItems = shoppingListState.draftItems.filter((item) => {
      if (
        item.productId == null ||
        item.inventoryDecreaseQuantity <= 0 ||
        !item.inventoryActionEligible
      ) {
        return false;
      }

      return mode === 'all' ? !item.checked : !item.checked;
    });

    if (selectedItems.length === 0) {
      toast.error(t('ordersManager.shoppingList.noInventoryChanges'));
      return;
    }

    const orderIds = shoppingListState.orders.map((order) => order.orderId);
    const toastId = toast.loading(
      t('ordersManager.shoppingList.inventoryApplyLoading', { count: selectedItems.length }),
    );

    try {
      const response = await applyShoppingListInventoryMutation.mutateAsync({
        items: selectedItems.map((item) => ({
          productId: item.productId!,
          quantity: item.inventoryDecreaseQuantity,
          source: {
            type: 'shopping-list',
            orderIds,
          },
        })),
      });

      updateShoppingListDraftItems((items) =>
        items
          .map((item) => {
            if (item.productId == null) {
              return item;
            }

            const applied = response.items.find((entry) => entry.productId === item.productId);
            if (!applied) {
              return item;
            }

            return recalculateShoppingListInventory(item, {
              inventoryQuantity: applied.nextQuantity,
              inventoryAppliedQuantity:
                item.inventoryAppliedQuantity + (applied.previousQuantity - applied.nextQuantity),
            });
          })
          .map((item) => {
            if (item.productId == null) {
              return item;
            }

            const applied = response.items.find((entry) => entry.productId === item.productId);
            return applied ? { ...item, checked: true } : item;
          }),
      );

      toast.success(
        t('ordersManager.shoppingList.inventoryApplySuccess', { count: response.items.length }),
        { id: toastId },
      );

      if (response.skipped.length > 0) {
        toast.error(
          response.skipped.map((item) => `${item.productId}: ${item.reason}`).join(' | '),
        );
      }
    } catch {
      toast.error(
        t('ordersManager.shoppingList.inventoryApplyError', { count: selectedItems.length }),
        { id: toastId },
      );
    }
  }

  async function updateAddressDelivery(order: OrderRecord, delivery: 0 | 1) {
    const draft = { ...getAddressDraft(order), delivery };
    setAddressDrafts((current) => ({
      ...current,
      [order.id]: draft,
    }));

    await patchMutation.mutateAsync({
      id: order.id,
      values: {
        delivery,
        state: parseStateDraftValue(draft.state),
        city: draft.city.trim() || null,
        homeAddress: draft.homeAddress.trim() || null,
      },
      messages: buildMessages(
        t,
        'notifications.orders.address.loading',
        'notifications.orders.address.success',
        'notifications.orders.address.error',
        { name: order.fullName },
      ),
    });

    setAddressDrafts((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  }

  async function updateAddressState(order: OrderRecord, state: string) {
    const nextDraft = {
      ...getAddressDraft(order),
      state,
      city: resolveCommuneForState(ecotrackCatalogQuery.data, state, getAddressDraft(order).city),
    };

    setAddressDrafts((current) => ({
      ...current,
      [order.id]: nextDraft,
    }));

    await patchMutation.mutateAsync({
      id: order.id,
      values: {
        delivery: nextDraft.delivery,
        state: parseStateDraftValue(nextDraft.state),
        city: nextDraft.city.trim() || null,
        homeAddress: nextDraft.homeAddress.trim() || null,
      },
      messages: buildMessages(
        t,
        'notifications.orders.address.loading',
        'notifications.orders.address.success',
        'notifications.orders.address.error',
        { name: order.fullName },
      ),
    });

    setAddressDrafts((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  }

  async function updateAddressCity(order: OrderRecord, city: string) {
    const nextDraft = {
      ...getAddressDraft(order),
      city,
    };

    setAddressDrafts((current) => ({
      ...current,
      [order.id]: nextDraft,
    }));

    await patchMutation.mutateAsync({
      id: order.id,
      values: {
        delivery: nextDraft.delivery,
        state: parseStateDraftValue(nextDraft.state),
        city: nextDraft.city.trim() || null,
        homeAddress: nextDraft.homeAddress.trim() || null,
      },
      messages: buildMessages(
        t,
        'notifications.orders.address.loading',
        'notifications.orders.address.success',
        'notifications.orders.address.error',
        { name: order.fullName },
      ),
    });

    setAddressDrafts((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  }

  return (
    <motion.section
      id="orders"
      className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      {...sectionTransitionProps}
    >
      <div className="border-b border-border/70 bg-linear-to-b from-background to-muted/20 px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('nav.orders')}</h2>
            <PendingInline
              active={isFilterPending || ordersQuery.isFetching}
              label={t('labels.loading')}
            />
          </div>

          <DailyOrderStatusOverviewPanel
            overview={overviewQuery.data?.overview}
            loading={overviewQuery.isFetching}
            projectionBasis={
              overviewQuery.data?.overview.available
                ? (overviewQuery.data.overview.reports?.find((report) => report.profitProjection)
                    ?.profitProjection?.basis ?? 'confirmed')
                : profitProjectionBasis
            }
            onProjectionBasisChange={setProfitProjectionBasis}
          />

          <div className="sm:rounded-[1.5rem] sm:border sm:border-border/70 sm:bg-background/90 sm:p-3">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex flex-col gap-3">
                <SearchField
                  value={search}
                  placeholder={t('ordersManager.searchPlaceholder')}
                  onChange={(value) => {
                    startFilterTransition(() => {
                      setPage(1);
                      setSearch(value);
                    });
                  }}
                />
                <ViewModeToggle
                  value={viewMode}
                  cardsLabel={t('ordersManager.view.cards')}
                  tableLabel={t('ordersManager.view.table')}
                  onChange={(nextViewMode) => {
                    setViewMode(nextViewMode);
                    writeStorage(ORDERS_VIEW_MODE_STORAGE_KEY, nextViewMode);
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  aria-label={t('ordersManager.filters.statusLabel')}
                  className="w-full sm:w-56"
                  value={statusFilter}
                  onChange={(event) => {
                    startFilterTransition(() => {
                      setPage(1);
                      setStatusFilter(event.target.value);
                      if (event.target.value !== '1') {
                        setNoAnswerFilter('all');
                      }
                    });
                  }}
                >
                  <NativeSelectOption value="all">
                    {t('ordersManager.filters.allStatuses')}
                  </NativeSelectOption>
                  <NativeSelectOption value="0">
                    {t('ordersManager.status.notContacted')}
                  </NativeSelectOption>
                  <NativeSelectOption value="1">
                    {t('ordersManager.status.noAnswer')}
                  </NativeSelectOption>
                  <NativeSelectOption value="2">
                    {t('ordersManager.status.confirmed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="11">
                    {t('ordersManager.status.posted')}
                  </NativeSelectOption>
                  <NativeSelectOption value="3">
                    {t('ordersManager.status.dispatched')}
                  </NativeSelectOption>
                  <NativeSelectOption value="4">
                    {t('ordersManager.status.completed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="5">
                    {t('ordersManager.status.delayed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="6">
                    {t('ordersManager.status.cancelled')}
                  </NativeSelectOption>
                  <NativeSelectOption value="7">
                    {t('ordersManager.status.inDelivery')}
                  </NativeSelectOption>
                  <NativeSelectOption value="8">
                    {t('ordersManager.status.returned')}
                  </NativeSelectOption>
                  <NativeSelectOption value="9">
                    {t('ordersManager.status.failed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="10">
                    {t('ordersManager.status.manualCompleted')}
                  </NativeSelectOption>
                </NativeSelect>
                {statusFilter === '1' ? (
                  <NativeSelect
                    aria-label={t('ordersManager.filters.noAnswerCountLabel')}
                    className="w-full sm:w-44"
                    value={noAnswerFilter}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setNoAnswerFilter(event.target.value);
                      });
                    }}
                  >
                    <NativeSelectOption value="all">
                      {t('ordersManager.filters.allNoAnswerCounts')}
                    </NativeSelectOption>
                    {[1, 2, 3, 4, 5].map((count) => (
                      <NativeSelectOption key={count} value={String(count)}>
                        {t('ordersManager.status.noAnswerWithCount', { count })}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : null}
                <Badge variant="outline">
                  {t('ordersManager.totalOrders', { count: totalOrders })}
                </Badge>
                <Badge variant="outline">
                  {t('labels.bulkSelectionCount', { count: selectedIds.length })}
                </Badge>
                <NativeSelect
                  aria-label={t('ordersManager.bulk.statusLabel')}
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value)}
                  className="w-full sm:min-w-44 sm:w-auto"
                >
                  <NativeSelectOption value="0">
                    {t('ordersManager.status.notContacted')}
                  </NativeSelectOption>
                  <NativeSelectOption value="1">
                    {t('ordersManager.status.noAnswer')}
                  </NativeSelectOption>
                  <NativeSelectOption value="2">
                    {t('ordersManager.status.confirmed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="3">
                    {t('ordersManager.status.dispatched')}
                  </NativeSelectOption>
                  <NativeSelectOption value="4">
                    {t('ordersManager.status.completed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="5">
                    {t('ordersManager.status.delayed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="6">
                    {t('ordersManager.status.cancelled')}
                  </NativeSelectOption>
                  <NativeSelectOption value="7">
                    {t('ordersManager.status.inDelivery')}
                  </NativeSelectOption>
                  <NativeSelectOption value="8">
                    {t('ordersManager.status.returned')}
                  </NativeSelectOption>
                  <NativeSelectOption value="9">
                    {t('ordersManager.status.failed')}
                  </NativeSelectOption>
                  <NativeSelectOption value="10">
                    {t('ordersManager.status.manualCompleted')}
                  </NativeSelectOption>
                </NativeSelect>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!writable || selectedOrders.length === 0}
                  onClick={() => void applyBulkStatus()}
                >
                  {t('ordersManager.bulk.applyStatus')}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <SplitActionButton
                  label={t('ordersManager.ecotrack.confirmedAction')}
                  icon={<Package data-icon="inline-start" />}
                  onPrimaryClick={() => void openConfirmedOrdersEcotrackPreview('delivro')}
                  options={[
                    {
                      key: 'export-selected',
                      label: t('ordersManager.export.selectedAction'),
                      onSelect: () => openSelectedOrdersExportPreview(),
                      disabled: selectedOrders.length === 0,
                    },
                    {
                      key: 'export-confirmed',
                      label: t('ordersManager.export.confirmedAction'),
                      onSelect: () => openConfirmedOrdersExportPreview(),
                    },
                    {
                      key: 'post-selected',
                      label: t('ordersManager.ecotrack.selectedAction'),
                      onSelect: () => openSelectedOrdersEcotrackPreview('delivro'),
                      disabled: selectedOrders.length === 0,
                    },
                    {
                      key: 'post-confirmed-emir',
                      label: t('ordersManager.ecotrack.emirConfirmedAction'),
                      onSelect: () => openConfirmedOrdersEcotrackPreview('emir'),
                    },
                    {
                      key: 'post-selected-emir',
                      label: t('ordersManager.ecotrack.emirSelectedAction'),
                      onSelect: () => openSelectedOrdersEcotrackPreview('emir'),
                      disabled: selectedOrders.length === 0,
                    },
                  ]}
                />
                <SplitActionButton
                  label={t('ordersManager.shoppingList.postedAction')}
                  icon={<ShoppingBasket data-icon="inline-start" />}
                  onPrimaryClick={() => void openPostedShoppingList()}
                  options={[
                    {
                      key: 'shopping-selected',
                      label: t('ordersManager.shoppingList.selectedAction'),
                      onSelect: () =>
                        openShoppingListForOrders(
                          selectedOrders,
                          t('ordersManager.shoppingList.selectedTitle', {
                            count: selectedOrders.length,
                          }),
                        ),
                      disabled: selectedOrders.length === 0,
                    },
                    {
                      key: 'shopping-confirmed',
                      label: t('ordersManager.shoppingList.confirmedAction'),
                      onSelect: () => openConfirmedShoppingList(),
                    },
                    {
                      key: 'shopping-dispatched',
                      label: t('ordersManager.shoppingList.dispatchedAction'),
                      onSelect: () => openDispatchedShoppingList(),
                    },
                    {
                      key: 'shopping-posted-and-confirmed',
                      label: t('ordersManager.shoppingList.postedAndConfirmedAction'),
                      onSelect: () => openPostedAndConfirmedShoppingList(),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative" aria-busy={showRefreshingProgress}>
        <div
          className={cn(
            'transition-[opacity,filter] duration-200',
            showRefreshingProgress && 'opacity-70',
          )}
        >
          {isInitialLoading ? (
            <>
              <OrdersTableSkeleton />
              <OrdersMobileSkeleton />
            </>
          ) : null}

          {!isInitialLoading ? (
            <>
              {ordersQuery.isError ? (
                <div className="px-3 pb-3 sm:px-5 sm:pb-4">
                  <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>{t('ordersManager.empty.title')}</EmptyTitle>
                      <EmptyDescription>{ordersQuery.error.message}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : null}
              <div
                className={cn(
                  'overflow-x-auto px-3 pb-3 sm:px-4 sm:pb-4',
                  viewMode === 'table' ? 'block' : 'hidden',
                )}
                data-testid="orders-table-view"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label={t('labels.selectAll')}
                          checked={allSelected}
                          onChange={(event) => {
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [
                                    ...new Set([
                                      ...current,
                                      ...paginatedOrders.map((order) => order.id),
                                    ]),
                                  ]
                                : current.filter(
                                    (id) => !paginatedOrders.some((order) => order.id === id),
                                  ),
                            );
                          }}
                        />
                      </TableHead>
                      <TableHead className="min-w-40">
                        <MultiSortHeader
                          label={t('ordersManager.columns.date')}
                          sortState={getSortRuleState(sortRules, 'createdAt')}
                          onClick={() => toggleSort('createdAt')}
                        />
                      </TableHead>
                      <TableHead className="min-w-[26rem]">
                        <MultiSortHeader
                          label={t('ordersManager.columns.client')}
                          sortState={getSortRuleState(sortRules, 'fullName')}
                          onClick={() => toggleSort('fullName')}
                        />
                      </TableHead>
                      <TableHead className="min-w-60">
                        {t('ordersManager.columns.products')}
                      </TableHead>
                      <TableHead className="min-w-80">
                        {t('ordersManager.columns.address')}
                      </TableHead>
                      <TableHead className="min-w-52">
                        {t('ordersManager.columns.amount')}
                      </TableHead>
                      <TableHead className="min-w-48">
                        <MultiSortHeader
                          label={t('ordersManager.columns.status')}
                          sortState={getSortRuleState(sortRules, 'confirmed')}
                          onClick={() => toggleSort('confirmed')}
                        />
                      </TableHead>
                      <TableHead className="min-w-52">
                        {t('ordersManager.columns.confirmedBy')}
                      </TableHead>
                      <TableHead className="min-w-64">{t('ordersManager.columns.notes')}</TableHead>
                      <TableHead className="w-40 text-center">{t('labels.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => {
                      const createdAt = formatDateParts(order.createdAt);
                      const addressDraft = getAddressDraft(order);
                      const noteDraft = getNoteDraft(order);
                      const phoneDraft = getPhoneDraft(order);
                      const wilayaId = Number.parseInt(addressDraft.state, 10);
                      const wilayaOptions = ecotrackCatalogQuery.data?.wilayas ?? [];
                      const communeOptions = Number.isInteger(wilayaId)
                        ? (ecotrackCatalogQuery.data?.communes ?? []).filter(
                            (entry) => entry.wilayaId === wilayaId,
                          )
                        : [];
                      const selectedWilaya = wilayaOptions.find(
                        (entry) => String(entry.wilayaId) === addressDraft.state,
                      );
                      const selectedCommune =
                        communeOptions.find(
                          (entry) => String(entry.communeId) === addressDraft.city,
                        ) ??
                        (order.city
                          ? communeOptions.find((entry) => entry.name === order.city)
                          : undefined);
                      const previewDeliveryFee = resolveEcotrackDeliveryFee(
                        ecotrackCatalogQuery.data,
                        addressDraft.delivery,
                        addressDraft.state,
                        order.deliveryFee,
                      );
                      const phoneHref = buildOrderPhoneTelHref(phoneDraft);
                      const nameDraft = getNameDraft(order);

                      return (
                        <TableRow key={order.id}>
                          <TableCell>
                            <Checkbox
                              aria-label={t('labels.selectRow', { name: order.fullName })}
                              checked={selectedIds.includes(order.id)}
                              onChange={(event) => {
                                setSelectedIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, order.id])]
                                    : current.filter((id) => id !== order.id),
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3">
                              <span className="text-sm font-semibold text-foreground">
                                {createdAt.date}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {createdAt.time}
                              </span>
                              <Badge variant="outline" className="mt-3 rounded-full">
                                #{order.id}
                              </Badge>
                              {order.ecotrackTrackingNumber ? (
                                <p className="mt-2 font-mono text-xs text-muted-foreground">
                                  {order.ecotrackTrackingNumber}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  className="min-w-[13rem] flex-1 font-semibold"
                                  value={nameDraft}
                                  disabled={!writable}
                                  onChange={(event) =>
                                    setNameDrafts((current) => ({
                                      ...current,
                                      [order.id]: event.target.value,
                                    }))
                                  }
                                  aria-label={t('ordersManager.name.label')}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="size-9 shrink-0 px-0"
                                  disabled={
                                    !writable ||
                                    nameDraft.trim().replace(/\s+/g, ' ') === order.fullName
                                  }
                                  aria-label={t('ordersManager.name.save')}
                                  onClick={() => void saveName(order)}
                                >
                                  <Save />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="size-9 shrink-0 px-0"
                                  variant="outline"
                                  disabled={
                                    !writable ||
                                    nameDraft.trim().replace(/\s+/g, ' ') === order.fullName
                                  }
                                  aria-label={t('ordersManager.name.cancel')}
                                  onClick={() =>
                                    setNameDrafts((current) => ({
                                      ...current,
                                      [order.id]: order.fullName,
                                    }))
                                  }
                                >
                                  <X />
                                </Button>
                              </div>
                              {order.isDegradedCapture ? (
                                <Badge variant="outline" className="mt-2 rounded-full">
                                  {t('ordersManager.capture.degraded')}
                                </Badge>
                              ) : null}
                              <p className="mt-3 font-mono text-sm font-medium tracking-[0.08em] text-foreground">
                                {formatOrderPhoneForDisplay(order.phoneNumber1) ||
                                  t('ordersManager.unconfirmed')}
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Input
                                  className="min-w-[13rem] flex-1 font-mono tracking-[0.08em]"
                                  value={phoneDraft}
                                  disabled={!writable}
                                  onChange={(event) =>
                                    setPhoneDrafts((current) => ({
                                      ...current,
                                      [order.id]: event.target.value,
                                    }))
                                  }
                                  aria-label={t('ordersManager.phone.label')}
                                />
                                {phoneHref ? (
                                  <a
                                    className={cn(
                                      'inline-flex size-9 shrink-0 items-center justify-center rounded-[0.75rem] border border-transparent bg-secondary text-secondary-foreground shadow-[var(--shadow-vapor)] transition-[background-color,color,box-shadow,transform] hover:bg-accent hover:text-accent-foreground',
                                    )}
                                    aria-label={t('ordersManager.phone.call')}
                                    href={phoneHref}
                                  >
                                    <Phone className="size-4" />
                                  </a>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  className="size-9 shrink-0 px-0"
                                  variant="outline"
                                  aria-label={t('ordersManager.copy.label')}
                                  onClick={() => void handleCopyPhone(order)}
                                >
                                  <Copy />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="size-9 shrink-0 px-0"
                                  disabled={!writable || phoneDraft.trim() === order.phoneNumber1}
                                  aria-label={t('ordersManager.phone.save')}
                                  onClick={() => void savePhone(order)}
                                >
                                  <Save />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="size-9 shrink-0 px-0"
                                  variant="outline"
                                  disabled={
                                    !writable ||
                                    normalizeOrderPhoneForStorage(phoneDraft) === order.phoneNumber1
                                  }
                                  aria-label={t('ordersManager.phone.cancel')}
                                  onClick={() =>
                                    setPhoneDrafts((current) => ({
                                      ...current,
                                      [order.id]: formatOrderPhoneForDisplay(order.phoneNumber1),
                                    }))
                                  }
                                >
                                  <X />
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <div className="flex flex-wrap gap-2">
                                <OrderProductsPreview
                                  orderId={order.id}
                                  products={order.orderProducts}
                                  emptyLabel={t('ordersManager.products.empty')}
                                  hoveredProductKey={hoveredProductKey}
                                  onHoverChange={setHoveredProductKey}
                                  formatMoney={formatMoney}
                                  limit={3}
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-3 w-full"
                                aria-label={t('ordersManager.actions.editProducts')}
                                onClick={() => setProductsDialog(buildProductsDialogState(order))}
                              >
                                <Package data-icon="inline-start" />
                                {t('ordersManager.actions.editProducts')}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <div className="grid grid-cols-3 gap-2">
                                <NativeSelect
                                  aria-label={t('ordersManager.address.delivery')}
                                  value={String(addressDraft.delivery)}
                                  disabled={!writable}
                                  onChange={(event) =>
                                    void updateAddressDelivery(
                                      order,
                                      Number(event.target.value) as 0 | 1,
                                    )
                                  }
                                >
                                  <NativeSelectOption value="0">
                                    {t('ordersManager.delivery.home')}
                                  </NativeSelectOption>
                                  <NativeSelectOption value="1">
                                    {t('ordersManager.delivery.office')}
                                  </NativeSelectOption>
                                </NativeSelect>
                                <NativeSelect
                                  aria-label={t('ordersManager.address.region')}
                                  value={addressDraft.state}
                                  disabled={!writable}
                                  onChange={(event) =>
                                    void updateAddressState(order, event.target.value)
                                  }
                                >
                                  <NativeSelectOption value="">
                                    {t('ordersManager.placeholders.region')}
                                  </NativeSelectOption>
                                  {wilayaOptions.map((entry) => (
                                    <NativeSelectOption
                                      key={entry.wilayaId}
                                      value={String(entry.wilayaId)}
                                    >
                                      {entry.name}
                                    </NativeSelectOption>
                                  ))}
                                  {!selectedWilaya && order.state ? (
                                    <NativeSelectOption value={String(order.state)}>
                                      {String(order.state)}
                                    </NativeSelectOption>
                                  ) : null}
                                </NativeSelect>
                                <NativeSelect
                                  aria-label={t('ordersManager.address.city')}
                                  value={addressDraft.city}
                                  disabled={!writable || !addressDraft.state}
                                  onChange={(event) =>
                                    void updateAddressCity(order, event.target.value)
                                  }
                                >
                                  <NativeSelectOption value="">
                                    {t('ordersManager.placeholders.city')}
                                  </NativeSelectOption>
                                  {communeOptions.map((entry) => (
                                    <NativeSelectOption
                                      key={entry.communeId}
                                      value={String(entry.communeId)}
                                    >
                                      {entry.name}
                                    </NativeSelectOption>
                                  ))}
                                  {!selectedCommune && addressDraft.city ? (
                                    <NativeSelectOption value={addressDraft.city}>
                                      {order.city ?? addressDraft.city}
                                    </NativeSelectOption>
                                  ) : null}
                                </NativeSelect>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                {addressDraft.delivery === 0 ? (
                                  <Input
                                    value={addressDraft.homeAddress}
                                    disabled={!writable}
                                    onChange={(event) =>
                                      setAddressDrafts((current) => ({
                                        ...current,
                                        [order.id]: {
                                          ...addressDraft,
                                          homeAddress: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder={t('ordersManager.placeholders.street')}
                                  />
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!writable}
                                  onClick={() => void saveAddress(order)}
                                >
                                  {t('actions.save')}
                                </Button>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {formatRegionLabel(
                                  ecotrackCatalogQuery.data,
                                  addressDraft.state || order.state,
                                  selectedCommune?.name ?? order.city ?? addressDraft.city,
                                  t('ordersManager.placeholders.region'),
                                )}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3 text-sm">
                              <p className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {t('ordersManager.amount.subtotal')}
                                </span>
                                <span className="font-medium text-foreground">
                                  {formatMoney(order.productSubtotal)}
                                </span>
                              </p>
                              {(order.promoDiscountAmount ?? 0) > 0 ? (
                                <p className="mt-2 flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">
                                    {t('ordersManager.amount.promoDiscount', {
                                      code: order.promoCode ?? '',
                                    })}
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    -{formatMoney(order.promoDiscountAmount ?? 0)}
                                  </span>
                                </p>
                              ) : null}
                              <p className="mt-2 flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {t('ordersManager.amount.deliveryFee')}
                                </span>
                                <span className="font-medium text-foreground">
                                  {formatMoney(previewDeliveryFee)}
                                </span>
                              </p>
                              <p className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3 font-semibold text-foreground">
                                <span>{t('ordersManager.amount.total')}</span>
                                <span>
                                  {formatMoney(order.productSubtotal + previewDeliveryFee)}
                                </span>
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <NativeSelect
                                aria-label={t('ordersManager.columns.status')}
                                value={String(order.confirmed)}
                                disabled={!writable}
                                onChange={(event) =>
                                  updateOrderStatus(
                                    order,
                                    Number(event.target.value) as OrderRecord['confirmed'],
                                  )
                                }
                              >
                                <NativeSelectOption value="0">
                                  {t('ordersManager.status.notContacted')}
                                </NativeSelectOption>
                                <NativeSelectOption value="1">
                                  {t('ordersManager.status.noAnswer')}
                                </NativeSelectOption>
                                <NativeSelectOption value="2">
                                  {t('ordersManager.status.confirmed')}
                                </NativeSelectOption>
                                <NativeSelectOption value="11" disabled>
                                  {t('ordersManager.status.posted')}
                                </NativeSelectOption>
                                <NativeSelectOption value="3">
                                  {t('ordersManager.status.dispatched')}
                                </NativeSelectOption>
                                <NativeSelectOption value="4">
                                  {t('ordersManager.status.completed')}
                                </NativeSelectOption>
                                <NativeSelectOption value="5">
                                  {t('ordersManager.status.delayed')}
                                </NativeSelectOption>
                                <NativeSelectOption value="6">
                                  {t('ordersManager.status.cancelled')}
                                </NativeSelectOption>
                                <NativeSelectOption value="7">
                                  {t('ordersManager.status.inDelivery')}
                                </NativeSelectOption>
                                <NativeSelectOption value="8">
                                  {t('ordersManager.status.returned')}
                                </NativeSelectOption>
                                <NativeSelectOption value="9">
                                  {t('ordersManager.status.failed')}
                                </NativeSelectOption>
                                <NativeSelectOption value="10">
                                  {t('ordersManager.status.manualCompleted')}
                                </NativeSelectOption>
                              </NativeSelect>
                              {order.confirmed === 1 ? (
                                <NoAnswerCounter
                                  count={Math.max(order.noAnswerCount, 1)}
                                  disabled={!writable}
                                  onDecrease={() =>
                                    updateOrderStatus(
                                      order,
                                      1,
                                      Math.max(order.noAnswerCount - 1, 1),
                                    )
                                  }
                                  onIncrease={() =>
                                    updateOrderStatus(order, 1, order.noAnswerCount + 1)
                                  }
                                />
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3">
                              <p className="font-semibold text-foreground">
                                {order.confirmedByName ??
                                  order.confirmedBy ??
                                  t('ordersManager.unconfirmed')}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {order.confirmedAt
                                  ? `${formatDateParts(order.confirmedAt).date} ${formatDateParts(order.confirmedAt).time}`
                                  : t('ordersManager.unconfirmedDate')}
                              </p>
                              {order.hasStatusHistory ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 w-full"
                                  onClick={() => setHistoryOrder(order)}
                                >
                                  <History data-icon="inline-start" />
                                  {t('ordersManager.history.button')}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <Input
                                value={noteDraft}
                                disabled={!writable}
                                aria-label={t('ordersManager.columns.notes')}
                                onChange={(event) =>
                                  setNoteDrafts((current) => ({
                                    ...current,
                                    [order.id]: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void saveNote(order);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="mt-3 w-full"
                                disabled={!writable}
                                aria-label={t('ordersManager.notes.save')}
                                onClick={() => void saveNote(order)}
                              >
                                <Save data-icon="inline-start" />
                                {t('ordersManager.notes.save')}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap items-center justify-center gap-2 rounded-[1.15rem] border border-border/70 bg-background p-3">
                              <Button
                                type="button"
                                size="sm"
                                className="size-9 px-0"
                                variant="outline"
                                aria-label={t('ordersManager.actions.editProducts')}
                                onClick={() => setProductsDialog(buildProductsDialogState(order))}
                              >
                                <Package />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="size-9 px-0"
                                variant="outline"
                                aria-label={t('ordersManager.actions.viewDetails')}
                                onClick={() => setDetailsOrder(order)}
                              >
                                <Eye />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="size-9 px-0"
                                variant="outline"
                                aria-label={t('ordersManager.tracking.copy')}
                                onClick={() => void handleCopyTrackingLink(order)}
                              >
                                <Link2 />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="size-9 px-0"
                                variant="destructive"
                                disabled={!writable}
                                aria-label={t('ordersManager.actions.deleteOrder')}
                                onClick={() =>
                                  setDeleteState({ id: order.id, label: order.fullName })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div
                className={cn(
                  'grid gap-2.5 px-3 pb-3 sm:gap-3 sm:px-4 sm:pb-4',
                  viewMode === 'cards' ? 'grid' : 'hidden',
                )}
                data-testid="orders-card-view"
              >
                {paginatedOrders.map((order) => {
                  const createdAt = formatDateParts(order.createdAt);
                  const noteDraft = getNoteDraft(order);
                  const phoneDraft = getPhoneDraft(order);
                  const addressDraft = getAddressDraft(order);
                  const wilayaId = Number.parseInt(addressDraft.state, 10);
                  const wilayaOptions = ecotrackCatalogQuery.data?.wilayas ?? [];
                  const communeOptions = Number.isInteger(wilayaId)
                    ? (ecotrackCatalogQuery.data?.communes ?? []).filter(
                        (entry) => entry.wilayaId === wilayaId,
                      )
                    : [];
                  const selectedCommune =
                    communeOptions.find((entry) => String(entry.communeId) === addressDraft.city) ??
                    (order.city
                      ? communeOptions.find((entry) => entry.name === order.city)
                      : undefined);
                  const previewDeliveryFee = resolveEcotrackDeliveryFee(
                    ecotrackCatalogQuery.data,
                    addressDraft.delivery,
                    addressDraft.state,
                    order.deliveryFee,
                  );
                  const phoneHref = buildOrderPhoneTelHref(phoneDraft);
                  const nameDraft = getNameDraft(order);

                  return (
                    <Card
                      key={order.id}
                      className="overflow-hidden rounded-[1.2rem] border border-border/70 bg-background shadow-sm sm:rounded-[1.5rem]"
                    >
                      <div className="border-b border-border/70 bg-linear-to-r from-muted/30 via-background to-muted/15 p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <Input
                              className="h-9 max-w-full text-lg font-bold"
                              value={nameDraft}
                              disabled={!writable}
                              onChange={(event) =>
                                setNameDrafts((current) => ({
                                  ...current,
                                  [order.id]: event.target.value,
                                }))
                              }
                              aria-label={t('ordersManager.name.label')}
                            />
                            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{createdAt.date}</span>
                              <span className="text-xs">{createdAt.time}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="outline" className="rounded-full">
                                #{order.id}
                              </Badge>
                              {order.isDegradedCapture ? (
                                <Badge variant="outline" className="rounded-full">
                                  {t('ordersManager.capture.degraded')}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
                            <Badge>{formatOrderStatusLabel(t, order.confirmed)}</Badge>
                            <p className="text-xs text-muted-foreground">
                              {order.confirmedByName ??
                                order.confirmedBy ??
                                t('ordersManager.unconfirmed')}
                            </p>
                            <div className="flex w-full gap-2 sm:w-auto">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled={
                                  !writable ||
                                  nameDraft.trim().replace(/\s+/g, ' ') === order.fullName
                                }
                                onClick={() => void saveName(order)}
                              >
                                <Save data-icon="inline-start" />
                                {t('ordersManager.name.save')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled={
                                  !writable ||
                                  nameDraft.trim().replace(/\s+/g, ' ') === order.fullName
                                }
                                onClick={() =>
                                  setNameDrafts((current) => ({
                                    ...current,
                                    [order.id]: order.fullName,
                                  }))
                                }
                              >
                                <X data-icon="inline-start" />
                                {t('ordersManager.name.cancel')}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {order.ecotrackTrackingNumber ? (
                          <div className="mt-3 rounded-[0.9rem] border border-border/70 bg-background/80 p-2.5 sm:mt-4 sm:rounded-[1rem] sm:p-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              ECOTRACK
                            </p>
                            <p className="mt-2 font-mono text-xs text-foreground">
                              {order.ecotrackTrackingNumber}
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-2">
                          <div className="rounded-[0.9rem] bg-background px-2.5 py-2.5 shadow-[var(--shadow-vapor)] sm:rounded-[1rem] sm:px-3 sm:py-3">
                            <div className="flex items-center gap-2">
                              <Phone className="size-4 text-primary" />
                              <p className="font-mono text-sm font-medium tracking-[0.08em] text-foreground">
                                {formatOrderPhoneForDisplay(order.phoneNumber1) ||
                                  t('ordersManager.unconfirmed')}
                              </p>
                            </div>
                            <div className="mt-2 flex min-w-0 flex-col gap-2 sm:mt-3 sm:flex-row sm:flex-wrap sm:items-center">
                              <Input
                                className="h-8 w-[9.5rem] max-w-full flex-none rounded-[0.8rem] px-2.5 py-0 text-xs leading-none font-mono tracking-[0.08em]"
                                value={phoneDraft}
                                disabled={!writable}
                                onChange={(event) =>
                                  setPhoneDrafts((current) => ({
                                    ...current,
                                    [order.id]: event.target.value,
                                  }))
                                }
                                aria-label={t('ordersManager.phone.label')}
                              />
                              <div className="flex min-w-0 w-full flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto"
                                  onClick={() => void handleCopyPhone(order)}
                                >
                                  <Copy data-icon="inline-start" />
                                  {t('ordersManager.copy.label')}
                                </Button>
                                {phoneHref ? (
                                  <a
                                    className="inline-flex h-9 w-full items-center justify-center rounded-[0.85rem] border border-border/70 bg-background px-3 text-sm sm:w-auto"
                                    aria-label={t('ordersManager.phone.call')}
                                    href={phoneHref}
                                  >
                                    <Phone data-icon="inline-start" />
                                    {t('ordersManager.phone.call')}
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[0.9rem] bg-background px-2.5 py-2.5 shadow-[var(--shadow-vapor)] sm:rounded-[1rem] sm:px-3 sm:py-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                              <NativeSelect
                                aria-label={t('ordersManager.address.delivery')}
                                value={String(addressDraft.delivery)}
                                disabled={!writable}
                                onChange={(event) =>
                                  void updateAddressDelivery(
                                    order,
                                    Number(event.target.value) as 0 | 1,
                                  )
                                }
                              >
                                <NativeSelectOption value="0">
                                  {t('ordersManager.delivery.home')}
                                </NativeSelectOption>
                                <NativeSelectOption value="1">
                                  {t('ordersManager.delivery.office')}
                                </NativeSelectOption>
                              </NativeSelect>
                              <NativeSelect
                                aria-label={t('ordersManager.address.region')}
                                value={addressDraft.state}
                                disabled={!writable}
                                onChange={(event) =>
                                  void updateAddressState(order, event.target.value)
                                }
                              >
                                <NativeSelectOption value="">
                                  {t('ordersManager.placeholders.region')}
                                </NativeSelectOption>
                                {wilayaOptions.map((entry) => (
                                  <NativeSelectOption
                                    key={entry.wilayaId}
                                    value={String(entry.wilayaId)}
                                  >
                                    {entry.name}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <NativeSelect
                                aria-label={t('ordersManager.address.city')}
                                value={addressDraft.city}
                                disabled={!writable || !addressDraft.state}
                                onChange={(event) =>
                                  void updateAddressCity(order, event.target.value)
                                }
                              >
                                <NativeSelectOption value="">
                                  {t('ordersManager.placeholders.city')}
                                </NativeSelectOption>
                                {communeOptions.map((entry) => (
                                  <NativeSelectOption
                                    key={entry.communeId}
                                    value={String(entry.communeId)}
                                  >
                                    {entry.name}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </div>
                            {addressDraft.delivery === 0 ? (
                              <Input
                                className="mt-2"
                                value={addressDraft.homeAddress}
                                disabled={!writable}
                                onChange={(event) =>
                                  setAddressDrafts((current) => ({
                                    ...current,
                                    [order.id]: {
                                      ...addressDraft,
                                      homeAddress: event.target.value,
                                    },
                                  }))
                                }
                                placeholder={t('ordersManager.placeholders.street')}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
                        <div>
                          <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-semibold text-foreground">
                              {t('ordersManager.columns.products')}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={() => setProductsDialog(buildProductsDialogState(order))}
                            >
                              <Package data-icon="inline-start" />
                              {t('ordersManager.actions.editProducts')}
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <OrderProductsPreview
                              orderId={order.id}
                              products={order.orderProducts}
                              emptyLabel={t('ordersManager.products.empty')}
                              hoveredProductKey={hoveredProductKey}
                              onHoverChange={setHoveredProductKey}
                              formatMoney={formatMoney}
                              limit={4}
                            />
                          </div>
                        </div>

                        <div className="rounded-[0.9rem] border border-border/70 bg-muted/15 p-2.5 sm:rounded-[1rem] sm:p-3">
                          <p className="text-sm font-medium text-muted-foreground">
                            {t('ordersManager.columns.address')}
                          </p>
                          <p className="mt-2 text-sm text-foreground">
                            {addressDraft.homeAddress ||
                              order.homeAddress ||
                              t('ordersManager.placeholders.street')}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatRegionLabel(
                              ecotrackCatalogQuery.data,
                              addressDraft.state,
                              selectedCommune?.name ?? order.city ?? addressDraft.city,
                              t('ordersManager.placeholders.region'),
                            )}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3 w-full"
                            disabled={!writable}
                            onClick={() => void saveAddress(order)}
                          >
                            {t('actions.save')}
                          </Button>
                        </div>

                        <div className="rounded-[0.9rem] border border-border/70 bg-muted/15 p-2.5 sm:rounded-[1rem] sm:p-3">
                          <p className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {t('ordersManager.amount.subtotal')}
                            </span>
                            <span className="font-medium text-foreground">
                              {formatMoney(order.productSubtotal)}
                            </span>
                          </p>
                          {(order.promoDiscountAmount ?? 0) > 0 ? (
                            <p className="mt-2 flex items-center justify-between gap-3 text-sm">
                              <span className="text-muted-foreground">
                                {t('ordersManager.amount.promoDiscount', {
                                  code: order.promoCode ?? '',
                                })}
                              </span>
                              <span className="font-medium text-emerald-700">
                                -{formatMoney(order.promoDiscountAmount ?? 0)}
                              </span>
                            </p>
                          ) : null}
                          <p className="mt-2 flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {t('ordersManager.amount.deliveryFee')}
                            </span>
                            <span className="font-medium text-foreground">
                              {formatMoney(previewDeliveryFee)}
                            </span>
                          </p>
                          <p className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3 font-semibold text-foreground">
                            <span>{t('ordersManager.amount.total')}</span>
                            <span>{formatMoney(order.productSubtotal + previewDeliveryFee)}</span>
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 min-[420px]:flex-row">
                          <Input
                            value={noteDraft}
                            disabled={!writable}
                            aria-label={t('ordersManager.columns.notes')}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [order.id]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void saveNote(order);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full min-[420px]:w-auto"
                            aria-label={t('ordersManager.notes.save')}
                            disabled={!writable}
                            onClick={() => void saveNote(order)}
                          >
                            <Save />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-col items-stretch gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
                        <Checkbox
                          aria-label={t('labels.selectRow', { name: order.fullName })}
                          checked={selectedIds.includes(order.id)}
                          onChange={(event) => {
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, order.id])]
                                : current.filter((id) => id !== order.id),
                            );
                          }}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                          <NativeSelect
                            className="w-full sm:w-auto"
                            aria-label={t('ordersManager.columns.status')}
                            value={String(order.confirmed)}
                            disabled={!writable}
                            onChange={(event) =>
                              updateOrderStatus(
                                order,
                                Number(event.target.value) as OrderRecord['confirmed'],
                              )
                            }
                          >
                            <NativeSelectOption value="0">
                              {t('ordersManager.status.notContacted')}
                            </NativeSelectOption>
                            <NativeSelectOption value="1">
                              {t('ordersManager.status.noAnswer')}
                            </NativeSelectOption>
                            <NativeSelectOption value="2">
                              {t('ordersManager.status.confirmed')}
                            </NativeSelectOption>
                            <NativeSelectOption value="11" disabled>
                              {t('ordersManager.status.posted')}
                            </NativeSelectOption>
                            <NativeSelectOption value="3">
                              {t('ordersManager.status.dispatched')}
                            </NativeSelectOption>
                            <NativeSelectOption value="4">
                              {t('ordersManager.status.completed')}
                            </NativeSelectOption>
                            <NativeSelectOption value="5">
                              {t('ordersManager.status.delayed')}
                            </NativeSelectOption>
                            <NativeSelectOption value="6">
                              {t('ordersManager.status.cancelled')}
                            </NativeSelectOption>
                            <NativeSelectOption value="7">
                              {t('ordersManager.status.inDelivery')}
                            </NativeSelectOption>
                            <NativeSelectOption value="8">
                              {t('ordersManager.status.returned')}
                            </NativeSelectOption>
                            <NativeSelectOption value="9">
                              {t('ordersManager.status.failed')}
                            </NativeSelectOption>
                            <NativeSelectOption value="10">
                              {t('ordersManager.status.manualCompleted')}
                            </NativeSelectOption>
                          </NativeSelect>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => setDetailsOrder(order)}
                          >
                            <Eye />
                          </Button>
                          {order.hasStatusHistory ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={() => setHistoryOrder(order)}
                            >
                              <History />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            aria-label={t('ordersManager.tracking.copy')}
                            onClick={() => void handleCopyTrackingLink(order)}
                          >
                            <Link2 data-icon="inline-start" />
                            {t('ordersManager.tracking.copy')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="w-full sm:w-auto"
                            disabled={!writable}
                            onClick={() => setDeleteState({ id: order.id, label: order.fullName })}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {(ordersQuery.data?.pagination?.totalItems ?? ordersQuery.data?.items.length ?? 0) ===
              0 ? (
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                  <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>{t('ordersManager.empty.title')}</EmptyTitle>
                      <EmptyDescription>{t('ordersManager.empty.description')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : null}

              <TablePaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))}
              />
            </>
          ) : null}
        </div>
        <SurfacePendingOverlay
          active={showRefreshingProgress}
          label={t('ordersManager.loading.refreshing')}
        />
      </div>

      <DetailsDialog
        order={detailsOrder}
        onOpenChange={(open) => !open && setDetailsOrder(null)}
        hoveredProductKey={hoveredProductKey}
        onHoverChange={setHoveredProductKey}
        formatMoney={formatMoney}
        catalog={ecotrackCatalogQuery.data}
      />
      <HistoryDialog order={historyOrder} onOpenChange={(open) => !open && setHistoryOrder(null)} />
      <ProductsDialog
        state={productsDialog}
        pending={patchMutation.isPending}
        onOpenChange={(open) => !open && setProductsDialog(null)}
        onSearchChange={(value) =>
          setProductsDialog((current) => (current ? { ...current, search: value } : current))
        }
        onAddProduct={addProductToDialog}
        onIncreaseQuantity={increaseProductQuantity}
        onDecreaseQuantity={decreaseProductQuantity}
        onRemoveProduct={removeProduct}
        onSave={() => void saveProducts()}
      />
      <DeleteDialog
        open={Boolean(deleteState)}
        onOpenChange={(open) => !open && setDeleteState(null)}
        title={t('labels.deleteDialogTitle')}
        description={t('labels.deleteDialogDescription', { target: deleteState?.label ?? '' })}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteState) {
            return;
          }

          deleteMutation.mutate({
            id: deleteState.id,
            messages: buildMessages(
              t,
              'notifications.orders.delete.loading',
              'notifications.orders.delete.success',
              'notifications.orders.delete.error',
              { target: deleteState.label },
            ),
          });
        }}
      />
      <ShoppingListDialog
        open={shoppingListOpen}
        state={shoppingListState}
        pending={addShoppingListProductMutation.isPending}
        inventoryPending={applyShoppingListInventoryMutation.isPending}
        saveStatus={shoppingListSaveStatus}
        onOpenChange={handleShoppingListOpenChange}
        onPrint={openShoppingListPrintView}
        onSearchChange={(value) =>
          updateShoppingListState((current) => ({ ...current, search: value }))
        }
        onAddProduct={(product) => void addProductToShoppingList(product)}
        onReset={resetShoppingListDraft}
        onRefresh={refreshShoppingListDraft}
        onToggleItem={toggleShoppingListItem}
        onIncreaseQuantity={increaseShoppingListItemQuantity}
        onDecreaseQuantity={decreaseShoppingListItemQuantity}
        onIncreaseInventoryDecrease={increaseShoppingListInventoryDecrease}
        onDecreaseInventoryDecrease={decreaseShoppingListInventoryDecrease}
        onRemoveItem={removeShoppingListItem}
        onApplyAllInventoryChanges={() => void applyShoppingListInventoryChanges('all')}
        onApplySelectedInventoryChanges={() => void applyShoppingListInventoryChanges('selected')}
      />
      <ExportOrdersDialog
        state={exportPreviewState}
        progress={exportProgressState}
        errorMessage={exportPreviewError}
        onOpenChange={(open) => {
          if (!open && !exportProgressState) {
            setExportPreviewState(null);
            setExportPreviewError(null);
          }
        }}
        onConfirm={() => void confirmExport()}
        onCancelJob={() => void cancelOrderExportMutation.mutateAsync()}
      />
      <EcotrackPostingDialog
        state={ecotrackPreviewState}
        progress={ecotrackProgressState}
        postingSummary={ecotrackPostingSummary}
        onOpenChange={(open) => {
          if (!open && !ecotrackProgressState) {
            setEcotrackPreviewState(null);
            setActiveEcotrackJobId(null);
          }
        }}
        onConfirm={() => void confirmEcotrackPosting()}
        onCancelJob={() => void cancelOrderEcotrackMutation.mutateAsync()}
      />
    </motion.section>
  );
}
