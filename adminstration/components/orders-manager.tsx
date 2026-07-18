'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Copy,
  Eye,
  History,
  Link2,
  Package,
  Phone,
  Printer,
  Save,
  Search,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type Dispatch, type ReactNode, type SetStateAction, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { toast } from '../lib/toast';
import { cn } from '../lib/utils';
import {
  buildOrderExportFileName,
  buildOrderExportRows,
  filterRecentConfirmedOrders,
  ORDER_EXPORT_HEADERS,
} from '../lib/order-export';
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
} from '../lib/orders';
import { appendSortParams, getSortRuleState, toggleSortRule } from '../lib/multi-sort';
import { buildOrderTrackingUrl } from '../lib/order-tracking-link';
import {
  buildShoppingListScopeKey,
  legacyShoppingListGeneratedAt,
  mergeShoppingListDraft,
  normalizeShoppingListOrderIds,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListDraftRecord,
  type ShoppingListDraftResponse,
  type ShoppingListOrderGroup,
  type ShoppingListSourceMode,
} from '../lib/shopping-list-drafts';
import {
  areCartProductsEqual,
  buildEditableProducts,
  OrderProductsEditor,
  type ProductSearchResponse,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
} from './order-products-editor';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Input } from './ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from './ui/motion';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { TablePaginationControls } from './table-pagination-controls';
import { MultiSortHeader } from './multi-sort-header';
import { ViewModeToggle, type ViewMode } from './view-mode-toggle';

type PaginationMeta = { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
type OrdersResponse = { items: OrderRecord[]; writable: boolean; pagination: PaginationMeta };
type ProfitProjectionBasis = 'confirmed' | 'posted';
type DailyProfitProjection = {
  basis: ProfitProjectionBasis;
  reportDay: string;
  grossProfit: number;
  adSpend: number;
  estimatedReturnRate: number;
  estimatedReturnedOrders: number;
  estimatedReturnLoss: number;
  projectedProfit: number;
  previousMonthStart: string;
  previousMonthEnd: string;
  previousMonthOrders: number;
  previousMonthNegativeOutcomeOrders: number;
};
type DailyOrderStatusReport = {
  reportDay: string;
  newOrders: number;
  confirmationStatusChanges: number;
  confirmedToday: number;
  noAnswerOrders: number;
  adminCancelled: number;
  carrierCancelled: number;
  shipmentUpdates: number;
  profitProjection?: DailyProfitProjection;
};
type DailyOrderStatusOverview = {
  available: true;
  reportDay: string;
  timezone: string;
  reports?: DailyOrderStatusReport[];
  newOrders: number;
  confirmationStatusChanges: number;
  confirmedToday: number;
  noAnswerOrders: number;
  adminCancelled: number;
  carrierCancelled: number;
  shipmentUpdates: number;
} | {
  available: false;
  reportDay: string | null;
  timezone: string;
};
type DailyOrderStatusOverviewResponse = { overview: DailyOrderStatusOverview };
type MutationMessages = { loading: string; success: string; error: string };
type QuerySnapshot<T> = Array<[readonly unknown[], T | undefined]>;
type SplitActionOption = { key: string; label: string; onSelect: () => void | Promise<void>; disabled?: boolean };
type PartialOrderPatch = Partial<OrderPatch>;
type PatchMutationVariables = { id: number; values: PartialOrderPatch; messages: MutationMessages; optimisticProducts?: EditableOrderProduct[] };
type DeleteMutationVariables = { id: number; messages: MutationMessages };

function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(locale: string, value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatPercent(locale: string, value: number) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}
type DeleteState = { id: number; label: string } | null;
type ProductsDialogState = { order: OrderRecord; items: EditableOrderProduct[]; search: string } | null;
type AddressDraft = { delivery: 0 | 1; state: string; city: string; homeAddress: string };
type ShoppingListBrandGroup = {
  brandId: number | null;
  brandName: string;
  products: ShoppingListDraftItem[];
};
type ShoppingListGenerationGroup = {
  generatedAt: string;
  label: string;
  brandGroups: ShoppingListBrandGroup[];
  orders: ShoppingListOrderGroup[];
};
type ShoppingListState = ShoppingListDraftPayload & {
  scopeKey: string;
  search: string;
  updatedAt: string | null;
  updatedByName: string | null;
} | null;
type ShoppingListSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type ExportRow = {
  reference: string;
  fullName: string;
  phoneNumber: string;
  phoneNumber2: string;
  wilayaCode: string;
  wilaya: string;
  commune: string;
  address: string;
  product: string;
  weightKg: string;
  totalToCollect: string;
  note: string;
  fragile: string;
  exchange: string;
  pickup: string;
  recouvrement: string;
  stopdesk: string;
  mapLink: string;
};
type ExportPreviewState = {
  mode: 'selected' | 'confirmed';
  title: string;
  fileName: string;
  orders: OrderRecord[];
  rows: ExportRow[];
} | null;
type ExportProgressState = {
  phase: string;
  current: number;
  total: number;
} | null;
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
type EcotrackOrderPayload = {
  reference: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  code_postal?: string;
  commune: string;
  code_wilaya: string;
  montant: string;
  remarque?: string;
  produit?: string;
  type: '1';
  stop_desk: 0 | 1;
};
type EcotrackPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};
type EcotrackPreviewSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};
type EcotrackPreviewInvalidItem = {
  orderId: number;
  customerName: string;
  reason: 'status_not_confirmed' | 'missing_phone' | 'missing_wilaya' | 'missing_commune' | 'invalid_commune' | 'missing_address' | 'missing_name';
  message: string;
};
type EcotrackPreviewResponse = {
  totalRequested: number;
  eligible: EcotrackPreviewItem[];
  skipped: EcotrackPreviewSkipItem[];
  invalid: EcotrackPreviewInvalidItem[];
};
type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  message: string;
};
type EcotrackPostingSummary = {
  totalRequested: number;
  eligible: number;
  created: number;
  skippedAlreadyPosted: number;
  invalid: number;
  failed: number;
  rateLimits: Array<Record<string, unknown>>;
  results: EcotrackPostingResultItem[];
};
type EcotrackPostingPreviewState = {
  mode: 'selected' | 'confirmed';
  provider: 'delivro' | 'emir';
  title: string;
  orderIds: number[];
  preview: EcotrackPreviewResponse;
} | null;

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
type EcotrackCatalogResponse = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{ communeId: number; wilayaId: number; name: string; postalCode: string | null; hasStopDesk: boolean }>;
  serviceFees: Array<{ serviceType: string; wilayaId: number; homeFee: string; stopDeskFee: string }>;
  weightFees: Array<{ serviceType: string; homeSurcharge: string; stopDeskSurcharge: string; perAdditionalKg: string; startsAtKg: string }>;
  lastSync: Record<string, unknown> | null;
};
type BrandLookupResponse = { id: number; name: string };
type ProductLookupResponse = { item: { id: number; inventoryQuantity: number; brandId?: number | null; slug?: string | null; title?: string; images?: string[] } };
type OrderDetailResponse = { ok: true; item: OrderRecord };
type InventoryApplyResponse = {
  ok: true;
  items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }>;
  skipped: Array<{ productId: number; reason: string }>;
};
type ShoppingListDraftSaveResponse = { ok: true; draft: ShoppingListDraftRecord };
const ORDERS_VIEW_MODE_STORAGE_KEY = 'orders-view-mode-v1';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function buildShoppingListDraftUrl(sourceMode: ShoppingListSourceMode, orderIds: readonly number[]) {
  const params = new URLSearchParams({ sourceMode });
  normalizeShoppingListOrderIds(orderIds).forEach((orderId) => {
    params.append('orderIds', String(orderId));
  });

  return `/api/orders/shopping-list-draft?${params.toString()}`;
}

function formatShoppingListGeneratedAt(value: string, locale: string, fallback: string) {
  if (value === legacyShoppingListGeneratedAt) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function groupShoppingListGenerations(
  state: NonNullable<ShoppingListState>,
  locale: string,
  fallbackLabel: string,
) {
  const groups = new Map<string, { products: ShoppingListDraftItem[]; orders: ShoppingListOrderGroup[] }>();

  for (const product of state.draftItems) {
    const generatedAt = product.generatedAt || legacyShoppingListGeneratedAt;
    const group = groups.get(generatedAt) ?? { products: [], orders: [] };
    group.products.push(product);
    groups.set(generatedAt, group);
  }

  for (const order of state.orders) {
    const generatedAt = order.generatedAt || legacyShoppingListGeneratedAt;
    const group = groups.get(generatedAt) ?? { products: [], orders: [] };
    group.orders.push(order);
    groups.set(generatedAt, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === legacyShoppingListGeneratedAt) {
        return 1;
      }
      if (right === legacyShoppingListGeneratedAt) {
        return -1;
      }
      return new Date(right).getTime() - new Date(left).getTime();
    })
    .map(([generatedAt, group]): ShoppingListGenerationGroup => {
      const brandGroupsMap = new Map<string, ShoppingListBrandGroup>();
      for (const product of group.products) {
        const key = `${product.brandId ?? 'none'}:${product.brandName}`;
        const brandGroup = brandGroupsMap.get(key) ?? { brandId: product.brandId, brandName: product.brandName, products: [] };
        brandGroup.products.push(product);
        brandGroupsMap.set(key, brandGroup);
      }

      return {
        generatedAt,
        label: formatShoppingListGeneratedAt(generatedAt, locale, fallbackLabel),
        brandGroups: [...brandGroupsMap.values()]
          .map((brandGroup) => ({
            ...brandGroup,
            products: [...brandGroup.products].sort((left, right) => left.title.localeCompare(right.title)),
          }))
          .sort((left, right) => left.brandName.localeCompare(right.brandName)),
        orders: [...group.orders].sort((left, right) => left.orderId - right.orderId),
      };
    });
}

async function fetchShoppingListDraft(sourceMode: ShoppingListSourceMode, orderIds: readonly number[]) {
  return request<ShoppingListDraftResponse>(buildShoppingListDraftUrl(sourceMode, orderIds));
}

async function saveShoppingListDraft(state: NonNullable<ShoppingListState>) {
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

function buildShoppingListStateFromDraft(draft: ShoppingListDraftRecord, title?: string): NonNullable<ShoppingListState> {
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

function readStorage<T>(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SplitActionButton({
  label,
  icon,
  onPrimaryClick,
  primaryDisabled = false,
  options,
}: {
  label: string;
  icon?: ReactNode;
  onPrimaryClick: () => void | Promise<void>;
  primaryDisabled?: boolean;
  options: SplitActionOption[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        disabled={primaryDisabled}
        className="rounded-r-none border-r border-border/70"
        onClick={() => void onPrimaryClick()}
      >
        {icon}
        {label}
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-label={`${label} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-l-none px-3"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-56 rounded-2xl border border-border/70 bg-background p-1 shadow-[var(--shadow-vapor)]"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              disabled={option.disabled}
              className={cn(
                'flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                option.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
              )}
              onClick={() => {
                setOpen(false);
                void option.onSelect();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatPhoneForDisplay(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('0') ? trimmed : `0${trimmed}`;
}

function normalizePhoneForStorage(value: string) {
  const trimmed = value.trim();
  if (/^0\d+$/.test(trimmed)) {
    return trimmed.slice(1);
  }

  return trimmed;
}

function buildPhoneTelHref(value: string | null | undefined) {
  const displayValue = formatPhoneForDisplay(value);
  if (!displayValue) {
    return null;
  }

  return `tel:${displayValue.replace(/\s+/g, '')}`;
}

function resolveWilayaLabel(catalog: EcotrackCatalogResponse | undefined, state: number | null) {
  if (state === null) {
    return '';
  }

  return catalog?.wilayas.find((entry) => entry.wilayaId === state)?.name ?? String(state);
}

function resolveCommuneLabel(catalog: EcotrackCatalogResponse | undefined, state: number | null, city: string | null) {
  const rawCity = (city ?? '').trim();
  if (!rawCity) {
    return '';
  }

  if (!catalog || state === null) {
    return rawCity;
  }

  const commune = catalog.communes.find((entry) => entry.wilayaId === state && (String(entry.communeId) === rawCity || entry.name === rawCity));
  return commune?.name ?? rawCity;
}

function captureQueries<T>(queryClient: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[]) {
  return queryClient.getQueriesData<T>({ queryKey }) as QuerySnapshot<T>;
}

function restoreQueries<T>(queryClient: ReturnType<typeof useQueryClient>, snapshot: QuerySnapshot<T>) {
  snapshot.forEach(([key, value]) => {
    queryClient.setQueryData(key, value);
  });
}

function updateOrderLists(queryClient: ReturnType<typeof useQueryClient>, updater: (order: OrderRecord) => OrderRecord | null) {
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

function optimisticOrder(order: OrderRecord, values: PartialOrderPatch, optimisticProducts?: EditableOrderProduct[]): OrderRecord {
  const cartProducts = values.cartProducts ?? order.cartProducts;
  const orderProducts = values.cartProducts !== undefined
    ? optimisticProducts
      ? summarizeEditableProducts(optimisticProducts)
      : buildOrderProductSummaries(cartProducts)
    : order.orderProducts;
  const productSubtotal = orderProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const confirmed = values.confirmed ?? order.confirmed;
  const noAnswerCount = confirmed === 1
    ? Math.max(values.noAnswerCount ?? order.noAnswerCount ?? 0, 1)
    : 0;
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
  _noAnswerCount: number,
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
    <div className={`mt-2 flex items-center ${compact ? 'gap-2' : 'justify-between gap-3 rounded-xl border border-border/70 p-2'}`}>
      <span className="text-sm text-muted-foreground">{t('ordersManager.status.noAnswerCounter', { count })}</span>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || count <= 1} onClick={onDecrease} aria-label={t('ordersManager.status.decreaseNoAnswer', { count: Math.max(count - 1, 1) })}>
          -
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onIncrease} aria-label={t('ordersManager.status.increaseNoAnswer', { count: count + 1 })}>
          +
        </Button>
      </div>
    </div>
  );
}

function formatOrderProductLabel(product: OrderProductSummary, formatMoney: (value: number) => string) {
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

async function fetchProductInventoryQuantity(productId: number | null, cache: Map<number, number>) {
  if (productId === null) {
    return null;
  }

  const cached = cache.get(productId);
  if (cached !== undefined) {
    return cached;
  }

  const product = await request<ProductLookupResponse>(`/api/products/${productId}`);
  cache.set(productId, product.item.inventoryQuantity);
  return product.item.inventoryQuantity;
}

function buildInventoryPreview(quantity: number, inventoryQuantity: number | null) {
  const available = Math.max(inventoryQuantity ?? 0, 0);
  const decreaseQuantity = Math.min(quantity, available);

  return {
    inventoryDecreaseQuantity: decreaseQuantity,
    inventoryShortageQuantity: Math.max(quantity - decreaseQuantity, 0),
    inventoryAppliedQuantity: 0,
    inventoryActionEligible: inventoryQuantity != null && decreaseQuantity > 0,
  };
}

function recalculateShoppingListInventory(item: ShoppingListDraftItem, overrides?: Partial<Pick<ShoppingListDraftItem, 'quantity' | 'inventoryQuantity' | 'inventoryAppliedQuantity'>>) {
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
  const orderIds = normalizeShoppingListOrderIds(orders.map((order) => order.id));
  const generatedAt = new Date().toISOString();
  const brandCache = new Map<number, string>();
  const inventoryCache = new Map<number, number>();
  const productMap = new Map<string, ShoppingListDraftItem>();

  for (const order of orders) {
    for (const product of order.orderProducts) {
      const key = `${product.brandId ?? 'none'}:${product.productId ?? product.rawValue}`;
      const existing = productMap.get(key);
      const note = order.note?.trim();

      if (existing) {
        existing.quantity += product.quantity;
        if (note && !existing.notes.includes(note)) {
          existing.notes.push(note);
        }
        continue;
      }

      const inventoryQuantity = await fetchProductInventoryQuantity(product.productId, inventoryCache);

      productMap.set(key, {
        draftId: key,
        productId: product.productId ?? null,
        brandId: product.brandId ?? null,
        brandName: await fetchBrandName(product.brandId ?? null, brandCache),
        title: product.title,
        quantity: product.quantity,
        thumbnailUrl: product.thumbnailUrl,
        inventoryQuantity,
        ...buildInventoryPreview(product.quantity, inventoryQuantity),
        notes: note ? [note] : [],
        checked: false,
        isCustom: false,
        generatedAt,
      });
    }
  }

  const ordersPanel: ShoppingListOrderGroup[] = await Promise.all(
    orders.map(async (order) => ({
      orderId: order.id,
      customerName: order.fullName,
      note: order.note,
      generatedAt,
      products: await Promise.all(
        order.orderProducts.map(async (product) => ({
          title: product.title,
          quantity: product.quantity,
          brandId: product.brandId ?? null,
          brandName: await fetchBrandName(product.brandId ?? null, brandCache),
          thumbnailUrl: product.thumbnailUrl,
        })),
      ),
    })),
  );

  const generatedItems = [...productMap.values()].sort((left, right) => {
    const brandCompare = left.brandName.localeCompare(right.brandName);
    return brandCompare !== 0 ? brandCompare : left.title.localeCompare(right.title);
  });

  return {
    sourceMode,
    orderIds,
    scopeKey: buildShoppingListScopeKey(sourceMode, orderIds),
    title,
    generatedItems,
    draftItems: generatedItems.map((item) => ({ ...item, notes: [...item.notes] })),
    orders: ordersPanel,
    search: '',
    updatedAt: null,
    updatedByName: null,
  };
}

async function buildMergedShoppingListState(orders: OrderRecord[], sourceMode: ShoppingListSourceMode, title: string) {
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

function buildShoppingListPrintHtml(state: NonNullable<ShoppingListState>, locale: string, previousGenerationLabel: string) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const generationGroups = groupShoppingListGenerations(state, locale, previousGenerationLabel);

  const brandsHtml = generationGroups.map((generation) => `
    <section>
      <h2>Generated ${escapeHtml(generation.label)}</h2>
      ${generation.brandGroups.map((group) => `
        <h3>${escapeHtml(group.brandName)}</h3>
        <ul>
          ${group.products
            .map((product) => `
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
                  ${product.inventoryActionEligible ? `<div>Inventory decrease: ${product.inventoryDecreaseQuantity}${product.inventoryShortageQuantity > 0 ? ` | Short: ${product.inventoryShortageQuantity}` : ''}</div>` : ''}
                  ${product.notes.length ? `<div>Notes: ${escapeHtml(product.notes.join(' | '))}</div>` : ''}
                </div>
              </div>
            </li>
          `).join('')}
        </ul>
      `).join('')}
    </section>
  `).join('');

  const ordersHtml = generationGroups.map((generation) => `
    <section>
      <h2>Generated ${escapeHtml(generation.label)}</h2>
      <ul>
        ${generation.orders.map((order) => `
          <li>
            <h3>#${order.orderId} ${escapeHtml(order.customerName)}</h3>
            ${order.note ? `<p>Note: ${escapeHtml(order.note)}</p>` : ''}
            <ul>
              ${order.products.map((product) => `
                <li>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${product.thumbnailUrl ? `<img src="${escapeHtml(product.thumbnailUrl)}" alt="${escapeHtml(product.title)}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid #d4d4d8; flex: none;" />` : ''}
                    <span>${escapeHtml(product.brandName)} / ${escapeHtml(product.title)} x${product.quantity}</span>
                  </div>
                </li>
              `).join('')}
            </ul>
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('');

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

function ProductThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-14 rounded-xl object-cover" />
  ) : (
    <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Package />
    </div>
  );
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
                <Badge variant="outline" className="max-w-full truncate hover:bg-primary/10 hover:text-primary">
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
                <img src={product.thumbnailUrl ?? ''} alt={`${product.title} thumbnail`} className="aspect-square w-full object-cover" />
              </div>
            ) : null}
          </div>
        );
      })}
      {limit && products.length > limit ? <Badge variant="outline">+{products.length - limit}</Badge> : null}
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

function normalizeCommuneValue(state: number | null, city: string | null, catalog?: EcotrackCatalogResponse) {
  const rawCity = (city ?? '').trim();

  if (!catalog || !rawCity || state === null) {
    return rawCity;
  }

  const byId = catalog.communes.find((entry) => String(entry.communeId) === rawCity && entry.wilayaId === state);
  if (byId) {
    return String(byId.communeId);
  }

  const byName = catalog.communes.find((entry) => entry.wilayaId === state && entry.name.toLowerCase() === rawCity.toLowerCase());
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
  const wilayaName = catalog && Number.isInteger(wilayaId)
    ? catalog.wilayas.find((entry) => entry.wilayaId === wilayaId)?.name
    : undefined;
  const communeName = catalog && Number.isInteger(wilayaId) && rawCity
    ? (
        catalog.communes.find((entry) => entry.wilayaId === wilayaId && String(entry.communeId) === rawCity)
        ?? catalog.communes.find((entry) => entry.wilayaId === wilayaId && entry.name.toLowerCase() === rawCity.toLowerCase())
      )?.name
    : undefined;

  return [wilayaName ?? rawState, communeName ?? rawCity].filter(Boolean).join(' / ') || placeholder;
}

function resolveDeliveryFeePreview(
  catalog: EcotrackCatalogResponse | undefined,
  delivery: 0 | 1,
  stateValue: string,
  fallback: number,
) {
  if (!catalog) {
    return fallback;
  }

  const wilayaId = Number.parseInt(stateValue, 10);
  if (!Number.isInteger(wilayaId)) {
    return fallback;
  }

  const serviceFee = catalog.serviceFees.find((entry) => entry.serviceType === 'livraison' && entry.wilayaId === wilayaId);
  if (!serviceFee) {
    return fallback;
  }

  return parseFloat(delivery === 0 ? serviceFee.homeFee : serviceFee.stopDeskFee) || 0;
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
  const currentCommune = communeOptions.find((entry) => String(entry.communeId) === rawCity)
    ?? communeOptions.find((entry) => entry.name.toLowerCase() === rawCity.toLowerCase());

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
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('ordersManager.columns.client')}</p>
              <p className="mt-2 font-medium">{detail.fullName}</p>
              {buildPhoneTelHref(detail.phoneNumber1) ? (
                <p className="text-sm text-muted-foreground">
                  <a className="underline-offset-4 hover:underline" href={buildPhoneTelHref(detail.phoneNumber1) ?? undefined}>
                    {formatPhoneForDisplay(detail.phoneNumber1)}
                  </a>
                </p>
              ) : null}
              {buildPhoneTelHref(detail.phoneNumber2) ? (
                <p className="text-sm text-muted-foreground">
                  <a className="underline-offset-4 hover:underline" href={buildPhoneTelHref(detail.phoneNumber2) ?? undefined}>
                    {formatPhoneForDisplay(detail.phoneNumber2)}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('ordersManager.columns.date')}</p>
              <p className="mt-2 text-sm">{detail.createdAt}</p>
              <p className="text-sm text-muted-foreground">{formatOrderStatusLabel(t, detail.confirmed, detail.noAnswerCount)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('ordersManager.columns.products')}</p>
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
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('ordersManager.columns.address')}</p>
              <p className="mt-2 text-sm">{t(`ordersManager.delivery.${getDeliveryTypeLabelKey(detail.delivery)}`)}</p>
              <p className="text-sm text-muted-foreground">{formatRegionLabel(catalog, detail.state, detail.city, t('ordersManager.placeholders.region'))}</p>
              <p className="text-sm text-muted-foreground">{detail.homeAddress || t('ordersManager.placeholders.street')}</p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('ordersManager.columns.notes')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{detail.note || t('ordersManager.notes.empty')}</p>
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
  const hasChanges = state ? !areCartProductsEqual(state.items.map((item) => item.rawValue), state.order.cartProducts) : false;
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
            footer={(
              <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                <p>{t('ordersManager.amount.subtotal')}: {formatMoney(productSubtotal)}</p>
                <p>{t('ordersManager.amount.deliveryFee')}: {formatMoney(state.order.deliveryFee ?? 0)}</p>
                <p className="font-semibold">{t('ordersManager.amount.total')}: {formatMoney(totalAmount)}</p>
              </div>
            )}
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

function HistoryDialog({ order, onOpenChange }: { order: OrderRecord | null; onOpenChange: (open: boolean) => void }) {
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
          {detail?.statusHistory.length ? detail.statusHistory.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge>{formatOrderStatusLabel(t, item.status, item.noAnswerCount)}</Badge>
                <p className="text-xs text-muted-foreground">{item.changedAt}</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.changedByName ?? item.changedBy ?? t('ordersManager.system')}</p>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">{t('ordersManager.history.empty')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShoppingListDialog({
  open,
  state,
  pending,
  inventoryPending,
  saveStatus,
  onOpenChange,
  onPrint,
  onSearchChange,
  onAddProduct,
  onReset,
  onRefresh,
  onToggleItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onIncreaseInventoryDecrease,
  onDecreaseInventoryDecrease,
  onRemoveItem,
  onApplyAllInventoryChanges,
  onApplySelectedInventoryChanges,
}: {
  open: boolean;
  state: ShoppingListState;
  pending: boolean;
  inventoryPending: boolean;
  saveStatus: ShoppingListSaveStatus;
  onOpenChange: (open: boolean) => void;
  onPrint: () => void;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onReset: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onToggleItem: (draftId: string) => void;
  onIncreaseQuantity: (draftId: string) => void;
  onDecreaseQuantity: (draftId: string) => void;
  onIncreaseInventoryDecrease: (draftId: string) => void;
  onDecreaseInventoryDecrease: (draftId: string) => void;
  onRemoveItem: (draftId: string) => void;
  onApplyAllInventoryChanges: () => void;
  onApplySelectedInventoryChanges: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const deferredSearch = useDeferredValue(state?.search ?? '');
  const searchQuery = useQuery({
    queryKey: ['shopping-list-products-search', deferredSearch],
    enabled: open && deferredSearch.trim().length > 0,
    queryFn: async () => {
      const response = await request<ProductSearchResponse>(`/api/products?page=1&limit=8&search=${encodeURIComponent(deferredSearch)}`);

      return response.items.map((item) => ({
        ...item,
        price: parseNumericAmount(item.price),
      }));
    },
  });
  const generationGroups = useMemo(() => {
    if (!state) {
      return [];
    }

    return groupShoppingListGenerations(state, locale, t('ordersManager.shoppingList.previousGeneration'));
  }, [locale, state, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{state?.title ?? t('ordersManager.shoppingList.title')}</DialogTitle>
          <DialogDescription className="flex flex-col gap-1">
            <span>{t('ordersManager.shoppingList.description')}</span>
            {state ? (
              <span className={cn('text-xs', saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {saveStatus === 'saving' ? t('ordersManager.shoppingList.saving') : null}
                {saveStatus === 'saved' ? t('ordersManager.shoppingList.saved') : null}
                {saveStatus === 'error' ? t('ordersManager.shoppingList.saveError') : null}
                {saveStatus === 'idle' && state.updatedByName ? t('ordersManager.shoppingList.lastSavedBy', { name: state.updatedByName }) : null}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 p-4">
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={onPrint}>
                    <Printer data-icon="inline-start" />
                    {t('ordersManager.shoppingList.print')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onReset()}>
                    {t('ordersManager.shoppingList.reset')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onRefresh()}>
                    {t('ordersManager.shoppingList.refresh')}
                  </Button>
                  <Button type="button" variant="outline" disabled={inventoryPending} onClick={onApplyAllInventoryChanges}>
                    {t('ordersManager.shoppingList.acceptAllInventoryChanges')}
                  </Button>
                  <Button type="button" variant="outline" disabled={inventoryPending} onClick={onApplySelectedInventoryChanges}>
                    {t('ordersManager.shoppingList.applySelectedInventoryChanges')}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t('ordersManager.shoppingList.addProductTitle')}</p>
                  <SearchField
                    value={state.search}
                    onChange={onSearchChange}
                    placeholder={t('ordersManager.shoppingList.addProductPlaceholder')}
                  />
                  {state.search.trim().length ? (
                    <div className="flex flex-col gap-3">
                      {searchQuery.isFetching ? <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchLoading')}</p> : null}
                      {!searchQuery.isFetching && searchQuery.data?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchEmpty')}</p>
                      ) : null}
                      {searchQuery.data?.map((product) => (
                        <Card key={product.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                          <ProductThumbnail src={product.images[0] ?? null} alt={product.title} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{product.title}</p>
                            <p className="text-sm text-muted-foreground">{t('ordersManager.products.unitPrice')}: {product.price}</p>
                          </div>
                          <Button type="button" size="sm" disabled={pending} onClick={() => onAddProduct(product)}>
                            {t('ordersManager.shoppingList.addProductAction')}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {generationGroups.map((generation) => (
                  <div key={`products-${generation.generatedAt}`} className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {t('ordersManager.shoppingList.generatedAt', { date: generation.label })}
                    </p>
                    <div className="mt-3 flex flex-col gap-4">
                      {generation.brandGroups.map((group) => (
                        <div key={`${generation.generatedAt}-${group.brandId ?? 'none'}-${group.brandName}`} className="rounded-xl border border-border/70 p-3">
                          <p className="font-medium">{group.brandName}</p>
                          <div className="mt-3 flex flex-col gap-2">
                            {group.products.map((product) => (
                              <div
                                key={product.draftId}
                                className={cn(
                                  'rounded-lg border p-2 text-sm',
                                  product.checked
                                    ? 'border-border/70 bg-muted/30 text-muted-foreground line-through'
                                    : product.inventoryQuantity != null && product.inventoryQuantity > 0
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border-border/70 bg-muted/30',
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={product.checked}
                                    onChange={() => onToggleItem(product.draftId)}
                                    aria-label={t('ordersManager.shoppingList.toggleItem', { title: product.title })}
                                  />
                                  {product.thumbnailUrl ? (
                                    <img
                                      src={product.thumbnailUrl}
                                      alt={product.title}
                                      className="size-10 rounded-md border border-border/70 object-cover"
                                    />
                                  ) : null}
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">{product.title} x{product.quantity}</p>
                                    {product.notes.length ? <p className="text-muted-foreground">{t('ordersManager.shoppingList.notes')}: {product.notes.join(' | ')}</p> : null}
                                    {product.isCustom ? <p className="text-xs text-muted-foreground">{t('ordersManager.shoppingList.customItem')}</p> : null}
                                    {product.inventoryActionEligible ? (
                                      <p className="text-xs font-medium text-emerald-700">
                                        {t('ordersManager.shoppingList.inventoryDecreasePreview', { count: product.inventoryDecreaseQuantity })}
                                        {product.inventoryShortageQuantity > 0 ? ` • ${t('ordersManager.shoppingList.inventoryShortage', { count: product.inventoryShortageQuantity })}` : ''}
                                      </p>
                                    ) : null}
                                    {product.inventoryAppliedQuantity > 0 ? (
                                      <p className="text-xs text-muted-foreground">
                                        {t('ordersManager.shoppingList.inventoryApplied', { count: product.inventoryAppliedQuantity })}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending || product.quantity <= 1}
                                      onClick={() => onDecreaseQuantity(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.decreaseQuantity', { title: product.title })}
                                    >
                                      -
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending}
                                      onClick={() => onIncreaseQuantity(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.increaseQuantity', { title: product.title })}
                                    >
                                      +
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending}
                                      onClick={() => onRemoveItem(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.removeItem', { title: product.title })}
                                    >
                                      <X />
                                    </Button>
                                  </div>
                                </div>
                                {product.productId != null ? (
                                  <div className="mt-3 flex items-center gap-2 pl-7">
                                    <span className="text-xs text-muted-foreground">{t('ordersManager.shoppingList.inventoryAdjustLabel')}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={inventoryPending || product.inventoryDecreaseQuantity <= 0}
                                      onClick={() => onDecreaseInventoryDecrease(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.decreaseInventoryDelta', { title: product.title })}
                                    >
                                      -1
                                    </Button>
                                    <span className="min-w-10 text-center text-sm font-medium">{product.inventoryDecreaseQuantity}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={inventoryPending || product.inventoryDecreaseQuantity >= Math.min(product.quantity, product.inventoryQuantity ?? 0)}
                                      onClick={() => onIncreaseInventoryDecrease(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.increaseInventoryDelta', { title: product.title })}
                                    >
                                      +1
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <div className="flex flex-col gap-4">
                {generationGroups.map((generation) => (
                  <div key={`orders-${generation.generatedAt}`} className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {t('ordersManager.shoppingList.generatedAt', { date: generation.label })}
                    </p>
                    <div className="mt-3 flex flex-col gap-3">
                      {generation.orders.map((order) => (
                        <div key={order.orderId} className="rounded-xl border border-border/70 p-3">
                          <p className="font-medium">#{order.orderId} {order.customerName}</p>
                          {order.note ? <p className="mt-1 text-sm text-muted-foreground">{t('ordersManager.shoppingList.notes')}: {order.note}</p> : null}
                          <div className="mt-3 flex flex-col gap-2">
                            {order.products.map((product, index) => (
                              <div key={`${order.orderId}-${index}`} className="flex items-center gap-3 text-sm">
                                {product.thumbnailUrl ? (
                                  <img
                                    src={product.thumbnailUrl}
                                    alt={product.title}
                                    className="size-8 rounded-md border border-border/70 object-cover"
                                  />
                                ) : null}
                                <p>
                                  {product.brandName} / {product.title} x{product.quantity}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExportOrdersDialog({
  state,
  progress,
  errorMessage,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: ExportPreviewState;
  progress: ExportProgressState;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancelJob: () => void;
}) {
  const t = useTranslations();
  const pending = progress !== null;
  const [expandedPreview, setExpandedPreview] = useState(false);

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className={cn('flex max-h-[90vh] flex-col overflow-hidden', expandedPreview ? 'sm:max-w-[95vw]' : 'sm:max-w-6xl')}>
        <DialogHeader className="shrink-0 border-b border-border/70 pb-4">
          <DialogTitle>{state?.title ?? t('ordersManager.export.previewTitle')}</DialogTitle>
          <DialogDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {state ? <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 font-mono text-xs text-foreground">{state.fileName}</span> : null}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-4">
            {progress ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span>{t(`ordersManager.export.progress.${progress.phase}`)}</span>
                  <span>{progress.current}/{progress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${progress.total === 0 ? 0 : (progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
            {errorMessage ? (
              <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setExpandedPreview((current) => !current)}>
                {t(expandedPreview ? 'ordersManager.export.compactPreview' : 'ordersManager.export.fullPreview')}
              </Button>
            </div>
            <div className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
              <div className={cn('h-full w-full', expandedPreview ? 'overflow-auto' : 'overflow-hidden')}>
                <div className={cn(expandedPreview ? 'min-w-[1200px]' : 'origin-top-left scale-[0.72] min-w-[1200px]')}>
                  <Table className="text-[11px] leading-tight">
                    <TableHeader>
                      <TableRow>
                        {ORDER_EXPORT_HEADERS.map((header) => (
                          <TableHead key={header} className="px-2 py-2 whitespace-nowrap">{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.rows.map((row) => (
                        <TableRow key={`${state.mode}-${row.reference}`}>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.reference}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.fullName}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.phoneNumber}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.phoneNumber2}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.wilayaCode}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.wilaya}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.commune}</TableCell>
                          <TableCell className="px-2 py-2">{row.address}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-pre-line">{row.product}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.weightKg}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.totalToCollect}</TableCell>
                          <TableCell className="px-2 py-2">{row.note}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.fragile}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.exchange}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.pickup}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.recouvrement}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.stopdesk}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.mapLink}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter className="sticky bottom-0 shrink-0 border-t border-border/70 bg-background pt-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelJob}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button type="button" disabled={pending || !state} onClick={onConfirm}>
            {t(state?.mode === 'confirmed' ? 'ordersManager.export.confirmAndDispatch' : 'ordersManager.export.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EcotrackPostingDialog({
  state,
  progress,
  postingSummary,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: EcotrackPostingPreviewState;
  progress: ExportProgressState;
  postingSummary: EcotrackPostingSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancelJob: () => void;
}) {
  const t = useTranslations();
  const pending = progress !== null;
  const preview = state?.preview ?? null;
  const summary = postingSummary;

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border/70 pb-4">
          <DialogTitle>{state?.title ?? t('ordersManager.ecotrack.previewTitle')}</DialogTitle>
        </DialogHeader>
        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
            {progress ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span>{t(`ordersManager.ecotrack.progress.${progress.phase}`)}</span>
                  <span>{progress.current}/{progress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${progress.total === 0 ? 0 : (progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-4"><p className="text-xs text-muted-foreground">{t('ordersManager.ecotrack.summary.totalRequested')}</p><p className="mt-1 text-lg font-semibold">{preview.totalRequested}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">{t('ordersManager.ecotrack.summary.eligible')}</p><p className="mt-1 text-lg font-semibold">{preview.eligible.length}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">{t('ordersManager.ecotrack.summary.skipped')}</p><p className="mt-1 text-lg font-semibold">{preview.skipped.length}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted-foreground">{t('ordersManager.ecotrack.summary.invalid')}</p><p className="mt-1 text-lg font-semibold">{preview.invalid.length}</p></Card>
            </div>

            <div className="rounded-2xl border border-border/70 p-4">
              <p className="mb-3 text-sm font-medium">{t('ordersManager.ecotrack.previewEligible')}</p>
              <div className="flex flex-col gap-3">
                {preview.eligible.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersManager.ecotrack.emptyEligible')}</p> : null}
                {preview.eligible.map((item) => (
                  <div key={item.orderId} className="rounded-xl border border-border/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">#{item.orderId} {item.customerName}</p>
                      <p className="text-sm text-muted-foreground">{item.destination} • {item.amount}</p>
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(item.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">{t('ordersManager.ecotrack.previewSkipped')}</p>
                <div className="flex flex-col gap-2">
                  {preview.skipped.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersManager.ecotrack.emptySkipped')}</p> : null}
                  {preview.skipped.map((item) => (
                    <div key={`skip-${item.orderId}`} className="rounded-lg border border-border/70 p-3 text-sm">
                      #{item.orderId} {item.customerName} • {t(`ordersManager.ecotrack.reasons.${item.reason}`)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">{t('ordersManager.ecotrack.previewInvalid')}</p>
                <div className="flex flex-col gap-2">
                  {preview.invalid.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersManager.ecotrack.emptyInvalid')}</p> : null}
                  {preview.invalid.map((item) => (
                    <div key={`invalid-${item.orderId}`} className="rounded-lg border border-border/70 p-3 text-sm">
                      <p>#{item.orderId} {item.customerName}</p>
                      <p className="text-muted-foreground">{t(`ordersManager.ecotrack.reasons.${item.reason}`)} • {item.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {summary ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">{t('ordersManager.ecotrack.resultTitle')}</p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Badge variant="outline">{t('ordersManager.ecotrack.summary.created')}: {summary.created}</Badge>
                  <Badge variant="outline">{t('ordersManager.ecotrack.summary.failed')}: {summary.failed}</Badge>
                  <Badge variant="outline">{t('ordersManager.ecotrack.summary.skipped')}: {summary.skippedAlreadyPosted}</Badge>
                  <Badge variant="outline">{t('ordersManager.ecotrack.summary.invalid')}: {summary.invalid}</Badge>
                  <Badge variant="outline">{t('ordersManager.ecotrack.summary.eligible')}: {summary.eligible}</Badge>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {summary.results.map((item) => (
                    <div key={`${item.reference}-${item.status}-${item.tracking ?? 'none'}`} className="rounded-lg border border-border/70 p-3 text-sm">
                      #{item.orderId} • {item.status} {item.tracking ? `• ${item.tracking}` : ''} {item.message ? `• ${item.message}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="sticky bottom-0 shrink-0 border-t border-border/70 bg-background pt-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelJob}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button type="button" disabled={pending || !state || preview?.eligible.length === 0} onClick={onConfirm}>
            {t('ordersManager.ecotrack.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DailyOrderStatusOverviewPanel({
  overview,
  loading,
  projectionBasis,
  onProjectionBasisChange,
}: {
  overview: DailyOrderStatusOverview | undefined;
  loading: boolean;
  projectionBasis: ProfitProjectionBasis;
  onProjectionBasisChange: (basis: ProfitProjectionBasis) => void;
}) {
  const t = useTranslations('ordersManager.overview');
  const locale = useLocale();

  if (!overview && loading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!overview?.available) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('unavailable')}</p>
      </div>
    );
  }

  const reportDate = new Date(`${overview.reportDay}T00:00:00`);
  const formattedReportDay = Number.isNaN(reportDate.getTime())
    ? overview.reportDay
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(reportDate);
  const reports = overview.reports && overview.reports.length > 0
    ? overview.reports
    : [{
      reportDay: overview.reportDay,
      newOrders: overview.newOrders,
      confirmationStatusChanges: overview.confirmationStatusChanges,
      confirmedToday: overview.confirmedToday,
      noAnswerOrders: overview.noAnswerOrders,
      adminCancelled: overview.adminCancelled,
      carrierCancelled: overview.carrierCancelled,
      shipmentUpdates: overview.shipmentUpdates,
    }];
  const hasProfitProjection = reports.some((report) => Boolean(report.profitProjection));

  return (
    <section className="rounded-xl border border-border/70 bg-background/90 p-3" aria-label={t('title')}>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('subtitle', { date: formattedReportDay })}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {hasProfitProjection ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('projection.basisLabel')}</span>
              <Switch
                checked={projectionBasis === 'posted'}
                disabled={loading}
                aria-label={t('projection.basisLabel')}
                onCheckedChange={(checked) => onProjectionBasisChange(checked ? 'posted' : 'confirmed')}
              />
              <span className="font-medium text-foreground">
                {t(projectionBasis === 'posted' ? 'projection.postedBasis' : 'projection.confirmedBasis')}
              </span>
            </label>
          ) : null}
          {loading ? <PendingInline active label={t('refreshing')} /> : null}
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {reports.map((report, reportIndex) => {
          const date = new Date(`${report.reportDay}T00:00:00`);
          const formattedDate = Number.isNaN(date.getTime())
            ? report.reportDay
            : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
          const items = [
            { key: 'newOrders', value: report.newOrders },
            { key: 'confirmationStatusChanges', value: report.confirmationStatusChanges },
            { key: 'confirmedToday', value: report.confirmedToday },
            { key: 'noAnswerOrders', value: report.noAnswerOrders },
            { key: 'adminCancelled', value: report.adminCancelled },
            { key: 'carrierCancelled', value: report.carrierCancelled },
            { key: 'shipmentUpdates', value: report.shipmentUpdates },
          ] as const;

          return (
            <div key={report.reportDay} className="rounded-lg border border-border/70 p-3">
              <div className="mb-3">
                <p className="text-sm font-medium">{t(reportIndex === 0 ? 'today' : 'yesterday')}</p>
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
                {items.map((item) => (
                  <Card key={item.key} className="rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{t(`metrics.${item.key}`)}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
                  </Card>
                ))}
              </div>
              {report.profitProjection ? (
                <div className="mt-3 rounded-lg border border-border/70 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{t('projection.title')}</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCurrency(locale, report.profitProjection.projectedProfit)}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projection.grossProfit')}</span><span className="font-medium">{formatCurrency(locale, report.profitProjection.grossProfit)}</span></p>
                    <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projection.adSpend')}</span><span className="font-medium">{formatCurrency(locale, report.profitProjection.adSpend)}</span></p>
                    <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projection.returnRate')}</span><span className="font-medium">{formatPercent(locale, report.profitProjection.estimatedReturnRate)}</span></p>
                    <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projection.estimatedReturns')}</span><span className="font-medium">{formatNumber(locale, report.profitProjection.estimatedReturnedOrders, 1)}</span></p>
                    <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projection.returnLoss')}</span><span className="font-medium">{formatCurrency(locale, report.profitProjection.estimatedReturnLoss)}</span></p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
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
  const [shoppingListSaveStatus, setShoppingListSaveStatus] = useState<ShoppingListSaveStatus>('idle');
  const [exportPreviewState, setExportPreviewState] = useState<ExportPreviewState>(null);
  const [exportPreviewError, setExportPreviewError] = useState<string | null>(null);
  const [ecotrackPreviewState, setEcotrackPreviewState] = useState<EcotrackPostingPreviewState>(null);
  const [activeEcotrackJobId, setActiveEcotrackJobId] = useState<string | null>(null);
  const [hoveredProductKey, setHoveredProductKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [profitProjectionBasis, setProfitProjectionBasis] = useState<ProfitProjectionBasis>('confirmed');
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
  const canUseInitialOrders = page === 1
    && deferredSearch.length === 0
    && deferredStatusFilter === 'all'
    && deferredNoAnswerFilter === 'all'
    && sortRules.length === 0;

  useEffect(() => {
    const stored = readStorage<ViewMode>(ORDERS_VIEW_MODE_STORAGE_KEY);
    if (stored === 'cards' || stored === 'table') {
      setViewMode(stored);
    }
  }, []);

  useEffect(() => () => {
    if (shoppingListSaveTimeoutRef.current) {
      clearTimeout(shoppingListSaveTimeoutRef.current);
    }
  }, []);

  const ordersQuery = useQuery({
    queryKey: ['orders-table', page, deferredSearch, deferredStatusFilter, deferredNoAnswerFilter, sortRules],
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

      const [, previousPage, previousSearch, previousConfirmed, previousNoAnswerCount, previousSortRules] = previousKey;
      const isPaginationOnlyChange = previousSearch === deferredSearch
        && previousConfirmed === deferredStatusFilter
        && previousNoAnswerCount === deferredNoAnswerFilter
        && previousSortRules === sortRules
        && previousPage !== page;

      return isPaginationOnlyChange ? keepPreviousData(previousData) : undefined;
    },
    staleTime: 60_000,
  });
  const overviewQuery = useQuery({
    queryKey: ['orders-overview', profitProjectionBasis],
    queryFn: () => request<DailyOrderStatusOverviewResponse>(`/api/orders/overview?projectionBasis=${profitProjectionBasis}`),
    initialData: profitProjectionBasis === 'confirmed' && initialOverview ? { overview: initialOverview } : undefined,
    initialDataUpdatedAt: profitProjectionBasis === 'confirmed' && initialOverview ? initialOverviewUpdatedAt : undefined,
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
    queryFn: () => request<OrderExportJobResponse>(`/api/orders/ecotrack?jobId=${encodeURIComponent(activeEcotrackJobId ?? '')}`),
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

      updateOrderLists(queryClient, (order) => (order.id === id ? optimisticOrder(order, values, optimisticProducts) : order));

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
    mutationFn: (payload) => request<OrderExportJobResponse>('/api/orders/export', {
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
    mutationFn: () => request<OrderExportJobResponse>('/api/orders/export', {
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
    mutationFn: (payload) => request<EcotrackPreviewResponse>('/api/orders/ecotrack/preview', {
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
    mutationFn: (payload) => request<OrderExportJobResponse>('/api/orders/ecotrack', {
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
    mutationFn: () => request<OrderExportJobResponse>('/api/orders/ecotrack', {
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
      const brandName = brandId === null
        ? 'Unbranded'
        : (await request<BrandLookupResponse>(`/api/brands/${brandId}`)).name;

      return { product: detail.item, brandName };
    },
  });
  const applyShoppingListInventoryMutation = useMutation<
    InventoryApplyResponse,
    Error,
    { items: Array<{ productId: number; quantity: number; source: { type: 'shopping-list'; orderIds: number[] } }> }
  >({
    mutationFn: ({ items }) => request<InventoryApplyResponse>('/api/inventory/apply', {
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
  const selectedOrders = useMemo(() => getCachedOrders(queryClient).filter((order) => selectedIds.includes(order.id)), [queryClient, selectedIds, ordersQuery.data]);
  const allSelected = paginatedOrders.length > 0 && paginatedOrders.every((order) => selectedIds.includes(order.id));
  const writable = ordersQuery.data?.writable ?? false;
  const orderExportJob = orderExportJobQuery.data.job;
  const orderEcotrackJob = orderEcotrackJobQuery.data.job;
  const exportProgressState: ExportProgressState = orderExportJob && (orderExportJob.status === 'queued' || orderExportJob.status === 'running')
    ? {
        phase: orderExportJob.progress.phase,
        current: orderExportJob.progress.current,
        total: orderExportJob.progress.total,
      }
    : null;
  const ecotrackProgressState: ExportProgressState = orderEcotrackJob && (orderEcotrackJob.status === 'queued' || orderEcotrackJob.status === 'running')
    ? {
        phase: orderEcotrackJob.progress.phase,
        current: orderEcotrackJob.progress.current,
        total: orderEcotrackJob.progress.total,
      }
    : null;
  const ecotrackPostingSummary = orderEcotrackJob?.resultSummary as EcotrackPostingSummary | null | undefined ?? null;
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
      setExportPreviewError(null);
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
      setExportPreviewError(orderExportJob.errorMessage || t('ordersManager.export.error'));
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

  const getPhoneDraft = (order: OrderRecord) => phoneDrafts[order.id] ?? formatPhoneForDisplay(order.phoneNumber1);
  const getNameDraft = (order: OrderRecord) => nameDrafts[order.id] ?? order.fullName;
  const getNoteDraft = (order: OrderRecord) => noteDrafts[order.id] ?? (order.note ?? '');
  const getAddressDraft = (order: OrderRecord): AddressDraft => addressDrafts[order.id] ?? {
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
      messages: buildMessages(t, 'notifications.orders.name.loading', 'notifications.orders.name.success', 'notifications.orders.name.error', { name: order.fullName }),
    });
  }

  async function savePhone(order: OrderRecord) {
    const displayValue = getPhoneDraft(order).trim();
    const normalizedValue = normalizePhoneForStorage(displayValue);
    if (!normalizedValue || normalizedValue === order.phoneNumber1) {
      setPhoneDrafts((current) => ({ ...current, [order.id]: formatPhoneForDisplay(order.phoneNumber1) }));
      return;
    }

    await patchMutation.mutateAsync({
      id: order.id,
      values: { phoneNumber1: normalizedValue },
      messages: buildMessages(t, 'notifications.orders.phone.loading', 'notifications.orders.phone.success', 'notifications.orders.phone.error', { name: order.fullName }),
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
      messages: buildMessages(t, 'notifications.orders.note.loading', 'notifications.orders.note.success', 'notifications.orders.note.error', { name: order.fullName }),
    });
  }

  async function saveAddress(order: OrderRecord) {
    const draft = getAddressDraft(order);
    if (
      draft.delivery === order.delivery
      && draft.state === formatStateValue(order.state)
      && draft.city === (order.city ?? '')
      && draft.homeAddress === (order.homeAddress ?? '')
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
      messages: buildMessages(t, 'notifications.orders.address.loading', 'notifications.orders.address.success', 'notifications.orders.address.error', { name: order.fullName }),
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

  function updateProductsDialogItems(updater: (items: EditableOrderProduct[]) => EditableOrderProduct[]) {
    setProductsDialog((current) => (current ? { ...current, items: updater(current.items) } : current));
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
        const response = await request<{ ok: true; publicToken: string }>(`/api/orders/${order.id}`, { method: 'POST' });
        publicToken = response.publicToken;
        updateOrderLists(queryClient, (current) => current.id === order.id ? { ...current, publicToken } : current);
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

  function updateOrderStatus(order: OrderRecord, confirmed: OrderRecord['confirmed'], noAnswerCount?: number) {
    patchMutation.mutate({
      id: order.id,
      values: {
        confirmed,
        ...(confirmed === 1 ? { noAnswerCount: Math.max(noAnswerCount ?? order.noAnswerCount ?? 0, 1) } : { noAnswerCount: 0 }),
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

    const toastId = toast.loading(t('notifications.orders.bulkStatus.loading', { count: orders.length }));

    try {
      await Promise.all(
        orders.map((order) =>
          request<{ ok: true; item: OrderRecord }>(`/api/orders/${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              confirmed,
              ...(confirmed === 1 ? { noAnswerCount: Math.max(order.noAnswerCount, 1) } : { noAnswerCount: 0 }),
            }),
          }),
        ),
      );

      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      await queryClient.invalidateQueries({ queryKey: ['orders-overview'] });
      toast.success(t('notifications.orders.bulkStatus.success', { count: orders.length }), { id: toastId });
      setSelectedIds([]);
    } catch {
      toast.error(t('notifications.orders.bulkStatus.error', { count: orders.length }), { id: toastId });
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
      setShoppingListState((current) => (
        current && current.scopeKey === response.draft.scopeKey
          ? { ...current, updatedAt: response.draft.updatedAt, updatedByName: response.draft.updatedByName }
          : current
      ));
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

  async function openCachedShoppingListDraft(sourceMode: ShoppingListSourceMode, orderIds: readonly number[], title: string) {
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

      const { state: nextState, loadedSharedDraft } = await buildMergedShoppingListState(orders, 'selected', title);
      setShoppingListState(nextState);
      setShoppingListSaveStatus('idle');
      setShoppingListOpen(true);
      toast.success(t(loadedSharedDraft ? 'ordersManager.shoppingList.sharedDraftLoaded' : 'ordersManager.shoppingList.ready'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function fetchOrdersByStatus(status: OrderRecord['confirmed']) {
    const items: OrderRecord[] = [];
    let nextPage = 1;
    let totalPagesForStatus = 1;

    do {
      const response = await request<OrdersResponse>(`/api/orders?page=${nextPage}&limit=100&confirmed=${status}&search=&sortKey=createdAt&sortDirection=desc`);
      items.push(...response.items);
      totalPagesForStatus = response.pagination.totalPages;
      nextPage += 1;
    } while (nextPage <= totalPagesForStatus);

    return items;
  }

  const shoppingListStatusConfig: Record<Exclude<ShoppingListSourceMode, 'selected'>, {
    statuses: Array<OrderRecord['confirmed']>;
    titleKey: string;
    emptyKey: string;
  }> = {
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

  async function fetchOrdersForShoppingListSource(sourceMode: Exclude<ShoppingListSourceMode, 'selected'>) {
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

  async function openStatusBasedShoppingList(sourceMode: Exclude<ShoppingListSourceMode, 'selected'>) {
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
      toast.success(t(loadedSharedDraft ? 'ordersManager.shoppingList.sharedDraftLoaded' : 'ordersManager.shoppingList.ready'), { id: toastId });
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
    openExportPreview(selectedOrders, 'selected', t('ordersManager.export.selectedTitle', { count: selectedOrders.length }));
  }

  async function openConfirmedOrdersExportPreview() {
    const toastId = toast.loading(t('ordersManager.export.loading'));

    try {
      const orders = filterRecentConfirmedOrders(await fetchOrdersByStatus(2));
      if (orders.length === 0) {
        toast.error(t('ordersManager.export.emptyConfirmed'), { id: toastId });
        return;
      }

      openExportPreview(orders, 'confirmed', t('ordersManager.export.confirmedTitle', { count: orders.length }));
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

  async function openEcotrackPreview(mode: 'selected' | 'confirmed', provider: 'delivro' | 'emir', orderIds: number[], title: string) {
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
    await openEcotrackPreview('selected', provider, selectedOrders.map((order) => order.id), provider === 'delivro'
      ? t('ordersManager.ecotrack.selectedTitle', { count: selectedOrders.length })
      : t('ordersManager.ecotrack.emirSelectedTitle', { count: selectedOrders.length }));
  }

  async function openConfirmedOrdersEcotrackPreview(provider: 'delivro' | 'emir') {
    const orders = await fetchOrdersByStatus(2);
    if (orders.length === 0) {
      toast.error(t('ordersManager.ecotrack.emptyConfirmed'));
      return;
    }
    await openEcotrackPreview('confirmed', provider, orders.map((order) => order.id), provider === 'delivro'
      ? t('ordersManager.ecotrack.confirmedTitle', { count: orders.length })
      : t('ordersManager.ecotrack.emirConfirmedTitle', { count: orders.length }));
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
    printWindow.document.write(buildShoppingListPrintHtml(shoppingListState, locale, t('ordersManager.shoppingList.previousGeneration')));
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

  function updateShoppingListDraftItems(updater: (items: ShoppingListDraftItem[]) => ShoppingListDraftItem[]) {
    updateShoppingListState((current) => ({ ...current, draftItems: updater(current.draftItems) }), { persist: true });
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
      await request<{ ok: true }>(buildShoppingListDraftUrl(shoppingListState.sourceMode, shoppingListState.orderIds), { method: 'DELETE' });
      setShoppingListState((current) => current ? ({
        ...current,
        draftItems: current.generatedItems.map((item) => ({ ...item, notes: [...item.notes], checked: false })),
        search: '',
        updatedAt: null,
        updatedByName: null,
      }) : current);
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
      const orders = shoppingListState.sourceMode === 'selected'
        ? getCachedOrders(queryClient).filter((order) => shoppingListState.orderIds.includes(order.id))
        : await fetchOrdersForShoppingListSource(shoppingListState.sourceMode);

      if (orders.length === 0) {
        toast.error(t('ordersManager.shoppingList.emptySelection'), { id: toastId });
        return;
      }

      const { state: nextState } = await buildMergedShoppingListState(orders, shoppingListState.sourceMode, shoppingListState.title);
      setShoppingListState(nextState);
      setShoppingListOpen(true);
      await saveShoppingListDraftNow(nextState);
      toast.success(t('ordersManager.shoppingList.refreshReady'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  function toggleShoppingListItem(draftId: string) {
    updateShoppingListDraftItems((items) => items.map((item) => (item.draftId === draftId ? { ...item, checked: !item.checked } : item)));
  }

  function increaseShoppingListItemQuantity(draftId: string) {
    updateShoppingListDraftItems((items) => items.map((item) => (
      item.draftId === draftId ? recalculateShoppingListInventory(item, { quantity: item.quantity + 1 }) : item
    )));
  }

  function decreaseShoppingListItemQuantity(draftId: string) {
    updateShoppingListDraftItems((items) => items.map((item) => (
      item.draftId === draftId && item.quantity > 1 ? recalculateShoppingListInventory(item, { quantity: item.quantity - 1 }) : item
    )));
  }

  function increaseShoppingListInventoryDecrease(draftId: string) {
    updateShoppingListDraftItems((items) => items.map((item) => {
      if (item.draftId !== draftId) {
        return item;
      }

      const maxDecrease = Math.min(item.quantity, item.inventoryQuantity ?? 0);
      return {
        ...item,
        inventoryDecreaseQuantity: Math.min(item.inventoryDecreaseQuantity + 1, maxDecrease),
        inventoryShortageQuantity: Math.max(item.quantity - Math.min(item.inventoryDecreaseQuantity + 1, maxDecrease), 0),
      };
    }));
  }

  function decreaseShoppingListInventoryDecrease(draftId: string) {
    updateShoppingListDraftItems((items) => items.map((item) => (
      item.draftId === draftId
        ? {
            ...item,
            inventoryDecreaseQuantity: Math.max(item.inventoryDecreaseQuantity - 1, 0),
            inventoryShortageQuantity: Math.max(item.quantity - Math.max(item.inventoryDecreaseQuantity - 1, 0), 0),
          }
        : item
    )));
  }

  function removeShoppingListItem(draftId: string) {
    updateShoppingListDraftItems((items) => items.filter((item) => item.draftId !== draftId));
  }

  async function addProductToShoppingList(product: ProductSearchItem) {
    try {
      const { product: detail, brandName } = await addShoppingListProductMutation.mutateAsync(product);
      updateShoppingListState((current) => {
        const existing = current.draftItems.find((item) => item.productId === detail.id);
        if (existing) {
          return {
            ...current,
            search: '',
            draftItems: current.draftItems.map((item) => (
              item.productId === detail.id ? { ...item, quantity: item.quantity + 1 } : item
            )),
          };
        }

        const nextItem: ShoppingListDraftItem = {
          draftId: `custom:${detail.id}`,
          productId: detail.id,
          brandId: detail.brandId ?? null,
          brandName: detail.brandId == null ? t('labels.noBrand') : brandName,
          title: detail.title ?? product.title,
          quantity: 1,
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
      }, { persist: true });
    } catch {
      toast.error(t('ordersManager.shoppingList.addProductError'));
    }
  }

  async function applyShoppingListInventoryChanges(mode: 'all' | 'selected') {
    if (!shoppingListState) {
      return;
    }

    const selectedItems = shoppingListState.draftItems.filter((item) => {
      if (item.productId == null || item.inventoryDecreaseQuantity <= 0 || !item.inventoryActionEligible) {
        return false;
      }

      return mode === 'all' ? !item.checked : !item.checked;
    });

    if (selectedItems.length === 0) {
      toast.error(t('ordersManager.shoppingList.noInventoryChanges'));
      return;
    }

    const orderIds = shoppingListState.orders.map((order) => order.orderId);
    const toastId = toast.loading(t('ordersManager.shoppingList.inventoryApplyLoading', { count: selectedItems.length }));

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

      updateShoppingListDraftItems((items) => items.map((item) => {
        if (item.productId == null) {
          return item;
        }

        const applied = response.items.find((entry) => entry.productId === item.productId);
        if (!applied) {
          return item;
        }

        return recalculateShoppingListInventory(item, {
          inventoryQuantity: applied.nextQuantity,
          inventoryAppliedQuantity: item.inventoryAppliedQuantity + (applied.previousQuantity - applied.nextQuantity),
        });
      }).map((item) => {
        if (item.productId == null) {
          return item;
        }

        const applied = response.items.find((entry) => entry.productId === item.productId);
        return applied ? { ...item, checked: true } : item;
      }));

      toast.success(t('ordersManager.shoppingList.inventoryApplySuccess', { count: response.items.length }), { id: toastId });

      if (response.skipped.length > 0) {
        toast.error(response.skipped.map((item) => `${item.productId}: ${item.reason}`).join(' | '));
      }
    } catch {
      toast.error(t('ordersManager.shoppingList.inventoryApplyError', { count: selectedItems.length }), { id: toastId });
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
      messages: buildMessages(t, 'notifications.orders.address.loading', 'notifications.orders.address.success', 'notifications.orders.address.error', { name: order.fullName }),
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
      messages: buildMessages(t, 'notifications.orders.address.loading', 'notifications.orders.address.success', 'notifications.orders.address.error', { name: order.fullName }),
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
      messages: buildMessages(t, 'notifications.orders.address.loading', 'notifications.orders.address.success', 'notifications.orders.address.error', { name: order.fullName }),
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
            <PendingInline active={isFilterPending || ordersQuery.isFetching} label={t('labels.loading')} />
          </div>

          <DailyOrderStatusOverviewPanel
            overview={overviewQuery.data?.overview}
            loading={overviewQuery.isFetching}
            projectionBasis={overviewQuery.data?.overview.available
              ? overviewQuery.data.overview.reports?.find((report) => report.profitProjection)?.profitProjection?.basis ?? 'confirmed'
              : profitProjectionBasis}
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
                  <NativeSelectOption value="all">{t('ordersManager.filters.allStatuses')}</NativeSelectOption>
                  <NativeSelectOption value="0">{t('ordersManager.status.notContacted')}</NativeSelectOption>
                  <NativeSelectOption value="1">{t('ordersManager.status.noAnswer')}</NativeSelectOption>
                  <NativeSelectOption value="2">{t('ordersManager.status.confirmed')}</NativeSelectOption>
                  <NativeSelectOption value="11">{t('ordersManager.status.posted')}</NativeSelectOption>
                  <NativeSelectOption value="3">{t('ordersManager.status.dispatched')}</NativeSelectOption>
                  <NativeSelectOption value="4">{t('ordersManager.status.completed')}</NativeSelectOption>
                  <NativeSelectOption value="5">{t('ordersManager.status.delayed')}</NativeSelectOption>
                  <NativeSelectOption value="6">{t('ordersManager.status.cancelled')}</NativeSelectOption>
                  <NativeSelectOption value="7">{t('ordersManager.status.inDelivery')}</NativeSelectOption>
                  <NativeSelectOption value="8">{t('ordersManager.status.returned')}</NativeSelectOption>
                  <NativeSelectOption value="9">{t('ordersManager.status.failed')}</NativeSelectOption>
                  <NativeSelectOption value="10">{t('ordersManager.status.manualCompleted')}</NativeSelectOption>
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
                    <NativeSelectOption value="all">{t('ordersManager.filters.allNoAnswerCounts')}</NativeSelectOption>
                    {[1, 2, 3, 4, 5].map((count) => (
                      <NativeSelectOption key={count} value={String(count)}>
                        {t('ordersManager.status.noAnswerWithCount', { count })}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : null}
                <Badge variant="outline">{t('ordersManager.totalOrders', { count: totalOrders })}</Badge>
                <Badge variant="outline">{t('labels.bulkSelectionCount', { count: selectedIds.length })}</Badge>
                <NativeSelect aria-label={t('ordersManager.bulk.statusLabel')} value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="w-full sm:min-w-44 sm:w-auto">
                  <NativeSelectOption value="0">{t('ordersManager.status.notContacted')}</NativeSelectOption>
                  <NativeSelectOption value="1">{t('ordersManager.status.noAnswer')}</NativeSelectOption>
                  <NativeSelectOption value="2">{t('ordersManager.status.confirmed')}</NativeSelectOption>
                  <NativeSelectOption value="3">{t('ordersManager.status.dispatched')}</NativeSelectOption>
                  <NativeSelectOption value="4">{t('ordersManager.status.completed')}</NativeSelectOption>
                  <NativeSelectOption value="5">{t('ordersManager.status.delayed')}</NativeSelectOption>
                  <NativeSelectOption value="6">{t('ordersManager.status.cancelled')}</NativeSelectOption>
                  <NativeSelectOption value="7">{t('ordersManager.status.inDelivery')}</NativeSelectOption>
                  <NativeSelectOption value="8">{t('ordersManager.status.returned')}</NativeSelectOption>
                  <NativeSelectOption value="9">{t('ordersManager.status.failed')}</NativeSelectOption>
                  <NativeSelectOption value="10">{t('ordersManager.status.manualCompleted')}</NativeSelectOption>
                </NativeSelect>
                <Button type="button" variant="outline" disabled={!writable || selectedOrders.length === 0} onClick={() => void applyBulkStatus()}>
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
                      onSelect: () => openShoppingListForOrders(selectedOrders, t('ordersManager.shoppingList.selectedTitle', { count: selectedOrders.length })),
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
        <div className={cn('transition-[opacity,filter] duration-200', showRefreshingProgress && 'opacity-70')}>
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
      <div className={cn('overflow-x-auto px-3 pb-3 sm:px-4 sm:pb-4', viewMode === 'table' ? 'block' : 'hidden')} data-testid="orders-table-view">
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
                        ? [...new Set([...current, ...paginatedOrders.map((order) => order.id)])]
                        : current.filter((id) => !paginatedOrders.some((order) => order.id === id)),
                    );
                  }}
                />
              </TableHead>
              <TableHead className="min-w-40">
                <MultiSortHeader label={t('ordersManager.columns.date')} sortState={getSortRuleState(sortRules, 'createdAt')} onClick={() => toggleSort('createdAt')} />
              </TableHead>
              <TableHead className="min-w-[26rem]">
                <MultiSortHeader label={t('ordersManager.columns.client')} sortState={getSortRuleState(sortRules, 'fullName')} onClick={() => toggleSort('fullName')} />
              </TableHead>
              <TableHead className="min-w-60">{t('ordersManager.columns.products')}</TableHead>
              <TableHead className="min-w-80">{t('ordersManager.columns.address')}</TableHead>
              <TableHead className="min-w-52">{t('ordersManager.columns.amount')}</TableHead>
              <TableHead className="min-w-48">
                <MultiSortHeader label={t('ordersManager.columns.status')} sortState={getSortRuleState(sortRules, 'confirmed')} onClick={() => toggleSort('confirmed')} />
              </TableHead>
              <TableHead className="min-w-52">{t('ordersManager.columns.confirmedBy')}</TableHead>
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
                ? (ecotrackCatalogQuery.data?.communes ?? []).filter((entry) => entry.wilayaId === wilayaId)
                : [];
              const selectedWilaya = wilayaOptions.find((entry) => String(entry.wilayaId) === addressDraft.state);
              const selectedCommune = communeOptions.find((entry) => String(entry.communeId) === addressDraft.city)
                ?? (order.city ? communeOptions.find((entry) => entry.name === order.city) : undefined);
              const previewDeliveryFee = resolveDeliveryFeePreview(ecotrackCatalogQuery.data, addressDraft.delivery, addressDraft.state, order.deliveryFee);
              const phoneHref = buildPhoneTelHref(phoneDraft);
              const nameDraft = getNameDraft(order);

              return (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={t('labels.selectRow', { name: order.fullName })}
                      checked={selectedIds.includes(order.id)}
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked ? [...new Set([...current, order.id])] : current.filter((id) => id !== order.id),
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3">
                      <span className="text-sm font-semibold text-foreground">{createdAt.date}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{createdAt.time}</span>
                      <Badge variant="outline" className="mt-3 rounded-full">#{order.id}</Badge>
                      {order.ecotrackTrackingNumber ? (
                        <p className="mt-2 font-mono text-xs text-muted-foreground">{order.ecotrackTrackingNumber}</p>
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
                          onChange={(event) => setNameDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                          aria-label={t('ordersManager.name.label')}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="size-9 shrink-0 px-0"
                          disabled={!writable || nameDraft.trim().replace(/\s+/g, ' ') === order.fullName}
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
                          disabled={!writable || nameDraft.trim().replace(/\s+/g, ' ') === order.fullName}
                          aria-label={t('ordersManager.name.cancel')}
                          onClick={() => setNameDrafts((current) => ({ ...current, [order.id]: order.fullName }))}
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
                        {formatPhoneForDisplay(order.phoneNumber1) || t('ordersManager.unconfirmed')}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Input
                          className="min-w-[13rem] flex-1 font-mono tracking-[0.08em]"
                          value={phoneDraft}
                          disabled={!writable}
                          onChange={(event) => setPhoneDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
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
                        <Button type="button" size="sm" className="size-9 shrink-0 px-0" variant="outline" aria-label={t('ordersManager.copy.label')} onClick={() => void handleCopyPhone(order)}>
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
                          disabled={!writable || normalizePhoneForStorage(phoneDraft) === order.phoneNumber1}
                          aria-label={t('ordersManager.phone.cancel')}
                          onClick={() => setPhoneDrafts((current) => ({ ...current, [order.id]: formatPhoneForDisplay(order.phoneNumber1) }))}
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
                          onChange={(event) => void updateAddressDelivery(order, Number(event.target.value) as 0 | 1)}
                        >
                          <NativeSelectOption value="0">{t('ordersManager.delivery.home')}</NativeSelectOption>
                          <NativeSelectOption value="1">{t('ordersManager.delivery.office')}</NativeSelectOption>
                        </NativeSelect>
                        <NativeSelect
                          aria-label={t('ordersManager.address.region')}
                          value={addressDraft.state}
                          disabled={!writable}
                          onChange={(event) => void updateAddressState(order, event.target.value)}
                        >
                          <NativeSelectOption value="">{t('ordersManager.placeholders.region')}</NativeSelectOption>
                          {wilayaOptions.map((entry) => (
                            <NativeSelectOption key={entry.wilayaId} value={String(entry.wilayaId)}>{entry.name}</NativeSelectOption>
                          ))}
                          {!selectedWilaya && order.state ? <NativeSelectOption value={String(order.state)}>{String(order.state)}</NativeSelectOption> : null}
                        </NativeSelect>
                        <NativeSelect
                          aria-label={t('ordersManager.address.city')}
                          value={addressDraft.city}
                          disabled={!writable || !addressDraft.state}
                          onChange={(event) => void updateAddressCity(order, event.target.value)}
                        >
                          <NativeSelectOption value="">{t('ordersManager.placeholders.city')}</NativeSelectOption>
                          {communeOptions.map((entry) => (
                            <NativeSelectOption key={entry.communeId} value={String(entry.communeId)}>{entry.name}</NativeSelectOption>
                          ))}
                          {!selectedCommune && addressDraft.city ? <NativeSelectOption value={addressDraft.city}>{order.city ?? addressDraft.city}</NativeSelectOption> : null}
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
                                [order.id]: { ...addressDraft, homeAddress: event.target.value },
                              }))
                            }
                            placeholder={t('ordersManager.placeholders.street')}
                          />
                        ) : null}
                        <Button type="button" size="sm" disabled={!writable} onClick={() => void saveAddress(order)}>
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
                        <span className="text-muted-foreground">{t('ordersManager.amount.subtotal')}</span>
                        <span className="font-medium text-foreground">{formatMoney(order.productSubtotal)}</span>
                      </p>
                      {(order.promoDiscountAmount ?? 0) > 0 ? (
                        <p className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{t('ordersManager.amount.promoDiscount', { code: order.promoCode ?? '' })}</span>
                          <span className="font-medium text-emerald-700">-{formatMoney(order.promoDiscountAmount ?? 0)}</span>
                        </p>
                      ) : null}
                      <p className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('ordersManager.amount.deliveryFee')}</span>
                        <span className="font-medium text-foreground">{formatMoney(previewDeliveryFee)}</span>
                      </p>
                      <p className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3 font-semibold text-foreground">
                        <span>{t('ordersManager.amount.total')}</span>
                        <span>{formatMoney(order.productSubtotal + previewDeliveryFee)}</span>
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                      <NativeSelect
                        aria-label={t('ordersManager.columns.status')}
                        value={String(order.confirmed)}
                        disabled={!writable}
                        onChange={(event) => updateOrderStatus(order, Number(event.target.value) as OrderRecord['confirmed'])}
                      >
                        <NativeSelectOption value="0">{t('ordersManager.status.notContacted')}</NativeSelectOption>
                        <NativeSelectOption value="1">{t('ordersManager.status.noAnswer')}</NativeSelectOption>
                        <NativeSelectOption value="2">{t('ordersManager.status.confirmed')}</NativeSelectOption>
                        <NativeSelectOption value="11" disabled>{t('ordersManager.status.posted')}</NativeSelectOption>
                        <NativeSelectOption value="3">{t('ordersManager.status.dispatched')}</NativeSelectOption>
                        <NativeSelectOption value="4">{t('ordersManager.status.completed')}</NativeSelectOption>
                        <NativeSelectOption value="5">{t('ordersManager.status.delayed')}</NativeSelectOption>
                        <NativeSelectOption value="6">{t('ordersManager.status.cancelled')}</NativeSelectOption>
                        <NativeSelectOption value="7">{t('ordersManager.status.inDelivery')}</NativeSelectOption>
                        <NativeSelectOption value="8">{t('ordersManager.status.returned')}</NativeSelectOption>
                        <NativeSelectOption value="9">{t('ordersManager.status.failed')}</NativeSelectOption>
                        <NativeSelectOption value="10">{t('ordersManager.status.manualCompleted')}</NativeSelectOption>
                      </NativeSelect>
                      {order.confirmed === 1 ? (
                        <NoAnswerCounter
                          count={Math.max(order.noAnswerCount, 1)}
                          disabled={!writable}
                          onDecrease={() => updateOrderStatus(order, 1, Math.max(order.noAnswerCount - 1, 1))}
                          onIncrease={() => updateOrderStatus(order, 1, order.noAnswerCount + 1)}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3">
                      <p className="font-semibold text-foreground">{order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.confirmedAt ? `${formatDateParts(order.confirmedAt).date} ${formatDateParts(order.confirmedAt).time}` : t('ordersManager.unconfirmedDate')}</p>
                      {order.hasStatusHistory ? (
                        <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => setHistoryOrder(order)}>
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
                        onChange={(event) => setNoteDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveNote(order);
                          }
                        }}
                      />
                      <Button type="button" size="sm" className="mt-3 w-full" disabled={!writable} aria-label={t('ordersManager.notes.save')} onClick={() => void saveNote(order)}>
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
                      <Button type="button" size="sm" className="size-9 px-0" variant="outline" aria-label={t('ordersManager.actions.viewDetails')} onClick={() => setDetailsOrder(order)}>
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
                        onClick={() => setDeleteState({ id: order.id, label: order.fullName })}
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

      <div className={cn('grid gap-2.5 px-3 pb-3 sm:gap-3 sm:px-4 sm:pb-4', viewMode === 'cards' ? 'grid' : 'hidden')} data-testid="orders-card-view">
        {paginatedOrders.map((order) => {
          const createdAt = formatDateParts(order.createdAt);
          const noteDraft = getNoteDraft(order);
          const phoneDraft = getPhoneDraft(order);
          const addressDraft = getAddressDraft(order);
          const wilayaId = Number.parseInt(addressDraft.state, 10);
          const wilayaOptions = ecotrackCatalogQuery.data?.wilayas ?? [];
          const communeOptions = Number.isInteger(wilayaId)
            ? (ecotrackCatalogQuery.data?.communes ?? []).filter((entry) => entry.wilayaId === wilayaId)
            : [];
          const selectedCommune = communeOptions.find((entry) => String(entry.communeId) === addressDraft.city)
            ?? (order.city ? communeOptions.find((entry) => entry.name === order.city) : undefined);
          const previewDeliveryFee = resolveDeliveryFeePreview(ecotrackCatalogQuery.data, addressDraft.delivery, addressDraft.state, order.deliveryFee);
          const phoneHref = buildPhoneTelHref(phoneDraft);
          const nameDraft = getNameDraft(order);

          return (
            <Card key={order.id} className="overflow-hidden rounded-[1.2rem] border border-border/70 bg-background shadow-sm sm:rounded-[1.5rem]">
              <div className="border-b border-border/70 bg-linear-to-r from-muted/30 via-background to-muted/15 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Input
                      className="h-9 max-w-full text-lg font-bold"
                      value={nameDraft}
                      disabled={!writable}
                      onChange={(event) => setNameDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                      aria-label={t('ordersManager.name.label')}
                    />
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{createdAt.date}</span>
                      <span className="text-xs">{createdAt.time}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">#{order.id}</Badge>
                      {order.isDegradedCapture ? (
                        <Badge variant="outline" className="rounded-full">
                          {t('ordersManager.capture.degraded')}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
                    <Badge>{formatOrderStatusLabel(t, order.confirmed, order.noAnswerCount)}</Badge>
                    <p className="text-xs text-muted-foreground">{order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}</p>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!writable || nameDraft.trim().replace(/\s+/g, ' ') === order.fullName}
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
                        disabled={!writable || nameDraft.trim().replace(/\s+/g, ' ') === order.fullName}
                        onClick={() => setNameDrafts((current) => ({ ...current, [order.id]: order.fullName }))}
                      >
                        <X data-icon="inline-start" />
                        {t('ordersManager.name.cancel')}
                      </Button>
                    </div>
                  </div>
                </div>

                {order.ecotrackTrackingNumber ? (
                  <div className="mt-3 rounded-[0.9rem] border border-border/70 bg-background/80 p-2.5 sm:mt-4 sm:rounded-[1rem] sm:p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">ECOTRACK</p>
                    <p className="mt-2 font-mono text-xs text-foreground">{order.ecotrackTrackingNumber}</p>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-col gap-2">
                  <div className="rounded-[0.9rem] bg-background px-2.5 py-2.5 shadow-[var(--shadow-vapor)] sm:rounded-[1rem] sm:px-3 sm:py-3">
                    <div className="flex items-center gap-2">
                      <Phone className="size-4 text-primary" />
                      <p className="font-mono text-sm font-medium tracking-[0.08em] text-foreground">
                        {formatPhoneForDisplay(order.phoneNumber1) || t('ordersManager.unconfirmed')}
                      </p>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-col gap-2 sm:mt-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <Input
                        className="h-8 w-[9.5rem] max-w-full flex-none rounded-[0.8rem] px-2.5 py-0 text-xs leading-none font-mono tracking-[0.08em]"
                        value={phoneDraft}
                        disabled={!writable}
                        onChange={(event) => setPhoneDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                        aria-label={t('ordersManager.phone.label')}
                      />
                      <div className="flex min-w-0 w-full flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center">
                        <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => void handleCopyPhone(order)}>
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
                        onChange={(event) => void updateAddressDelivery(order, Number(event.target.value) as 0 | 1)}
                      >
                        <NativeSelectOption value="0">{t('ordersManager.delivery.home')}</NativeSelectOption>
                        <NativeSelectOption value="1">{t('ordersManager.delivery.office')}</NativeSelectOption>
                      </NativeSelect>
                      <NativeSelect
                        aria-label={t('ordersManager.address.region')}
                        value={addressDraft.state}
                        disabled={!writable}
                        onChange={(event) => void updateAddressState(order, event.target.value)}
                      >
                        <NativeSelectOption value="">{t('ordersManager.placeholders.region')}</NativeSelectOption>
                        {wilayaOptions.map((entry) => (
                          <NativeSelectOption key={entry.wilayaId} value={String(entry.wilayaId)}>{entry.name}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        aria-label={t('ordersManager.address.city')}
                        value={addressDraft.city}
                        disabled={!writable || !addressDraft.state}
                        onChange={(event) => void updateAddressCity(order, event.target.value)}
                      >
                        <NativeSelectOption value="">{t('ordersManager.placeholders.city')}</NativeSelectOption>
                        {communeOptions.map((entry) => (
                          <NativeSelectOption key={entry.communeId} value={String(entry.communeId)}>{entry.name}</NativeSelectOption>
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
                            [order.id]: { ...addressDraft, homeAddress: event.target.value },
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
                    <p className="font-semibold text-foreground">{t('ordersManager.columns.products')}</p>
                    <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setProductsDialog(buildProductsDialogState(order))}>
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
                  <p className="text-sm font-medium text-muted-foreground">{t('ordersManager.columns.address')}</p>
                  <p className="mt-2 text-sm text-foreground">{addressDraft.homeAddress || order.homeAddress || t('ordersManager.placeholders.street')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatRegionLabel(
                      ecotrackCatalogQuery.data,
                      addressDraft.state,
                      selectedCommune?.name ?? order.city ?? addressDraft.city,
                      t('ordersManager.placeholders.region'),
                    )}
                  </p>
                  <Button type="button" size="sm" className="mt-3 w-full" disabled={!writable} onClick={() => void saveAddress(order)}>
                    {t('actions.save')}
                  </Button>
                </div>

                <div className="rounded-[0.9rem] border border-border/70 bg-muted/15 p-2.5 sm:rounded-[1rem] sm:p-3">
                  <p className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{t('ordersManager.amount.subtotal')}</span>
                    <span className="font-medium text-foreground">{formatMoney(order.productSubtotal)}</span>
                  </p>
                  {(order.promoDiscountAmount ?? 0) > 0 ? (
                    <p className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{t('ordersManager.amount.promoDiscount', { code: order.promoCode ?? '' })}</span>
                      <span className="font-medium text-emerald-700">-{formatMoney(order.promoDiscountAmount ?? 0)}</span>
                    </p>
                  ) : null}
                  <p className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{t('ordersManager.amount.deliveryFee')}</span>
                    <span className="font-medium text-foreground">{formatMoney(previewDeliveryFee)}</span>
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
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveNote(order);
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" className="w-full min-[420px]:w-auto" aria-label={t('ordersManager.notes.save')} disabled={!writable} onClick={() => void saveNote(order)}>
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
                      event.target.checked ? [...new Set([...current, order.id])] : current.filter((id) => id !== order.id),
                    );
                  }}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <NativeSelect
                    className="w-full sm:w-auto"
                    aria-label={t('ordersManager.columns.status')}
                    value={String(order.confirmed)}
                    disabled={!writable}
                    onChange={(event) => updateOrderStatus(order, Number(event.target.value) as OrderRecord['confirmed'])}
                  >
                    <NativeSelectOption value="0">{t('ordersManager.status.notContacted')}</NativeSelectOption>
                    <NativeSelectOption value="1">{t('ordersManager.status.noAnswer')}</NativeSelectOption>
                    <NativeSelectOption value="2">{t('ordersManager.status.confirmed')}</NativeSelectOption>
                    <NativeSelectOption value="11" disabled>{t('ordersManager.status.posted')}</NativeSelectOption>
                    <NativeSelectOption value="3">{t('ordersManager.status.dispatched')}</NativeSelectOption>
                    <NativeSelectOption value="4">{t('ordersManager.status.completed')}</NativeSelectOption>
                    <NativeSelectOption value="5">{t('ordersManager.status.delayed')}</NativeSelectOption>
                    <NativeSelectOption value="6">{t('ordersManager.status.cancelled')}</NativeSelectOption>
                    <NativeSelectOption value="7">{t('ordersManager.status.inDelivery')}</NativeSelectOption>
                    <NativeSelectOption value="8">{t('ordersManager.status.returned')}</NativeSelectOption>
                    <NativeSelectOption value="9">{t('ordersManager.status.failed')}</NativeSelectOption>
                    <NativeSelectOption value="10">{t('ordersManager.status.manualCompleted')}</NativeSelectOption>
                  </NativeSelect>
                  <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setDetailsOrder(order)}>
                    <Eye />
                  </Button>
                  {order.hasStatusHistory ? (
                    <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setHistoryOrder(order)}>
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
                  <Button type="button" size="sm" variant="destructive" className="w-full sm:w-auto" disabled={!writable} onClick={() => setDeleteState({ id: order.id, label: order.fullName })}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {((ordersQuery.data?.pagination?.totalItems ?? ordersQuery.data?.items.length) ?? 0) === 0 ? (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>{t('ordersManager.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('ordersManager.empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}

      <TablePaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))} />
      </>
      ) : null}
        </div>
        <SurfacePendingOverlay active={showRefreshingProgress} label={t('ordersManager.loading.refreshing')} />
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
        onSearchChange={(value) => setProductsDialog((current) => (current ? { ...current, search: value } : current))}
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
            messages: buildMessages(t, 'notifications.orders.delete.loading', 'notifications.orders.delete.success', 'notifications.orders.delete.error', { target: deleteState.label }),
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
        onSearchChange={(value) => updateShoppingListState((current) => ({ ...current, search: value }))}
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
