'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Copy,
  Eye,
  History,
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
  ORDER_EXPORT_HEADERS,
} from '../lib/order-export';
import {
  buildOrderProductSummaries,
  getDeliveryTypeLabelKey,
  getOrderStatusLabelKey,
  parseNumericAmount,
  type OrderPatch,
  type OrderProductSummary,
  type OrderRecord,
  type OrderSortKey,
  type SortDirection,
} from '../lib/orders';
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
import { PendingInline, sectionTransitionProps } from './ui/motion';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { TablePaginationControls } from './table-pagination-controls';

type PaginationMeta = { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
type OrdersResponse = { items: OrderRecord[]; writable: boolean; pagination: PaginationMeta };
type ProductSearchItem = { id: number; title: string; price: number | string; images: string[]; sku?: string | null; barcode?: string | null; mongoId?: string | null };
type ProductSearchResponse = { items: ProductSearchItem[] };
type MutationMessages = { loading: string; success: string; error: string };
type QuerySnapshot<T> = Array<[readonly unknown[], T | undefined]>;
type SplitActionOption = { key: string; label: string; onSelect: () => void | Promise<void>; disabled?: boolean };
type EditableOrderProduct = {
  rawValue: string;
  productId: number | null;
  title: string;
  unitPrice: number;
  thumbnailUrl: string | null;
  missing: boolean;
};
type PatchMutationVariables = { id: number; values: OrderPatch; messages: MutationMessages; optimisticProducts?: EditableOrderProduct[] };
type DeleteMutationVariables = { id: number; messages: MutationMessages };
type DeleteState = { id: number; label: string } | null;
type ProductsDialogState = { order: OrderRecord; items: EditableOrderProduct[]; search: string } | null;
type AddressDraft = { delivery: 0 | 1; state: string; city: string; homeAddress: string };
type ShoppingListSourceMode = 'selected' | 'confirmed' | 'dispatched';
type ShoppingListDraftItem = {
  draftId: string;
  productId: number | null;
  brandId: number | null;
  brandName: string;
  title: string;
  quantity: number;
  thumbnailUrl: string | null;
  inventoryQuantity: number | null;
  inventoryDecreaseQuantity: number;
  inventoryShortageQuantity: number;
  inventoryAppliedQuantity: number;
  inventoryActionEligible: boolean;
  notes: string[];
  checked: boolean;
  isCustom: boolean;
};
type ShoppingListBrandGroup = {
  brandId: number | null;
  brandName: string;
  products: ShoppingListDraftItem[];
};
type ShoppingListOrderGroup = {
  orderId: number;
  customerName: string;
  note: string | null;
  products: Array<{ title: string; quantity: number; brandId: number | null; brandName: string; thumbnailUrl: string | null }>;
};
type ShoppingListState = {
  sourceMode: ShoppingListSourceMode;
  title: string;
  generatedItems: ShoppingListDraftItem[];
  draftItems: ShoppingListDraftItem[];
  orders: ShoppingListOrderGroup[];
  search: string;
} | null;
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
  title: string;
  orderIds: number[];
  preview: EcotrackPreviewResponse;
} | null;
type EcotrackCatalogResponse = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{ communeId: number; wilayaId: number; name: string; postalCode: string | null; hasStopDesk: boolean }>;
  serviceFees: Array<{ serviceType: string; wilayaId: number; homeFee: string; stopDeskFee: string }>;
  weightFees: Array<{ serviceType: string; homeSurcharge: string; stopDeskSurcharge: string; perAdditionalKg: string; startsAtKg: string }>;
  lastSync: Record<string, unknown> | null;
};
type BrandLookupResponse = { id: number; name: string };
type ProductLookupResponse = { item: { id: number; inventoryQuantity: number; brandId?: number | null; title?: string; images?: string[] } };
type OrderDetailResponse = { ok: true; item: OrderRecord };
type InventoryApplyResponse = {
  ok: true;
  items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }>;
  skipped: Array<{ productId: number; reason: string }>;
};

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

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button type="button" className="inline-flex items-center gap-2 text-left font-medium" onClick={onClick}>
      <span>{label}</span>
      <Icon className="size-4" />
    </button>
  );
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

function findProductSummary(order: OrderRecord, rawValue: string) {
  const trimmed = rawValue.trim();
  const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;

  return order.orderProducts.find((product) => product.rawValue === trimmed || (numericId !== null && product.productId === numericId)) ?? null;
}

function buildEditableProducts(order: OrderRecord): EditableOrderProduct[] {
  return order.cartProducts.map((rawValue) => {
    const product = findProductSummary(order, rawValue);

    return {
      rawValue,
      productId: product?.productId ?? null,
      title: product?.title ?? rawValue,
      unitPrice: product?.unitPrice ?? 0,
      thumbnailUrl: product?.thumbnailUrl ?? null,
      missing: product?.missing ?? true,
    };
  });
}

function summarizeEditableProducts(items: EditableOrderProduct[]) {
  return buildOrderProductSummaries(items.map((item) => item.rawValue), (rawValue) => {
    const product = items.find((entry) => entry.rawValue === rawValue.trim());

    if (!product) {
      return { missing: true };
    }

    return {
      productId: product.productId,
      title: product.title,
      unitPrice: product.unitPrice,
      thumbnailUrl: product.thumbnailUrl,
      missing: product.missing,
    };
  });
}

function buildProductsDialogState(order: OrderRecord) {
  return {
    order,
    items: buildEditableProducts(order),
    search: '',
  };
}

function areCartProductsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function optimisticOrder(order: OrderRecord, values: OrderPatch, optimisticProducts?: EditableOrderProduct[]): OrderRecord {
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

  return {
    ...order,
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
      });
    }
  }

  const ordersPanel: ShoppingListOrderGroup[] = await Promise.all(
    orders.map(async (order) => ({
      orderId: order.id,
      customerName: order.fullName,
      note: order.note,
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
    title,
    generatedItems,
    draftItems: generatedItems.map((item) => ({ ...item, notes: [...item.notes] })),
    orders: ordersPanel,
    search: '',
  };
}

function buildShoppingListPrintHtml(state: NonNullable<ShoppingListState>) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const groupedBrands = state.draftItems.reduce<Map<string, ShoppingListBrandGroup>>((groups, product) => {
    const key = `${product.brandId ?? 'none'}:${product.brandName}`;
    const group = groups.get(key) ?? { brandId: product.brandId, brandName: product.brandName, products: [] };
    group.products.push(product);
    groups.set(key, group);
    return groups;
  }, new Map());

  const brandsHtml = [...groupedBrands.values()]
    .sort((left, right) => left.brandName.localeCompare(right.brandName))
    .map((group) => `
    <section>
      <h2>${escapeHtml(group.brandName)}</h2>
      <ul>
        ${group.products
          .sort((left, right) => left.title.localeCompare(right.title))
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
    </section>
  `).join('');

  const ordersHtml = state.orders.map((order) => `
    <section>
      <h2>#${order.orderId} ${escapeHtml(order.customerName)}</h2>
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

        return (
          <div
            key={hoverKey}
            className="relative inline-flex"
            onMouseEnter={() => onHoverChange(hoverKey)}
            onMouseLeave={() => onHoverChange((current) => (current === hoverKey ? null : current))}
          >
            <Badge variant="outline" className="max-w-full truncate">
              {formatOrderProductLabel(product, formatMoney)}
            </Badge>
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
  const wilaya = detail && catalog ? catalog.wilayas.find((entry) => entry.wilayaId === detail.state) : null;
  const commune = detail && catalog && detail.state !== null
    ? catalog.communes.find((entry) => entry.wilayaId === detail.state && (String(entry.communeId) === (detail.city ?? '') || entry.name === detail.city))
    : null;

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
              <p className="text-sm text-muted-foreground">{[wilaya?.name ?? detail.state, commune?.name ?? detail.city].filter(Boolean).join(' / ') || t('ordersManager.placeholders.region')}</p>
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
  const deferredSearch = useDeferredValue(state?.search ?? '');
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
  const searchQuery = useQuery({
    queryKey: ['order-products-search', deferredSearch],
    enabled: Boolean(state) && deferredSearch.trim().length > 0,
    queryFn: async () => {
      const response = await request<ProductSearchResponse>(`/api/products?page=1&limit=8&search=${encodeURIComponent(deferredSearch)}`);

      return response.items.map((item) => ({
        ...item,
        price: parseNumericAmount(item.price),
      }));
    },
  });

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.products.title')}</DialogTitle>
          <DialogDescription>{state?.order.fullName}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('ordersManager.products.searchTitle')}</p>
              <SearchField
                value={state?.search ?? ''}
                onChange={onSearchChange}
                placeholder={t('ordersManager.products.searchPlaceholder')}
              />
            </div>

            {state?.search.trim().length ? (
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
                      <p className="text-sm text-muted-foreground">{formatMoney(parseNumericAmount(product.price))}</p>
                      {product.sku || product.barcode ? (
                        <p className="truncate text-xs text-muted-foreground">{[product.sku, product.barcode].filter(Boolean).join(' • ')}</p>
                      ) : null}
                    </div>
                    <Button type="button" size="sm" onClick={() => onAddProduct(product)}>
                      {t('ordersManager.products.add')}
                    </Button>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchHint')}</p>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4">
            <div>
              <p className="text-sm font-medium">{t('ordersManager.products.selectedTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('ordersManager.products.selectedDescription')}</p>
            </div>
            <div className="flex flex-col gap-3">
              {selectedProducts.length ? selectedProducts.map((product) => (
                <Card key={product.rawValue} className="rounded-2xl border border-border/70 p-3">
                  <div className="flex items-start gap-3">
                    <ProductThumbnail src={product.thumbnailUrl} alt={product.title} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{product.title}</p>
                      <p className="text-sm text-muted-foreground">{t('ordersManager.products.unitPrice')}: {formatMoney(product.unitPrice)}</p>
                      <p className="text-sm text-muted-foreground">{t('ordersManager.products.lineTotal')}: {formatMoney(product.lineTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Badge variant="outline">{t('ordersManager.products.quantity', { count: product.quantity })}</Badge>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onDecreaseQuantity(product.rawValue)} aria-label={t('ordersManager.products.decreaseQuantity', { title: product.title })}>
                        -
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onIncreaseQuantity(product.rawValue)} aria-label={t('ordersManager.products.increaseQuantity', { title: product.title })}>
                        +
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onRemoveProduct(product.rawValue)} aria-label={t('ordersManager.products.removeProduct', { title: product.title })}>
                        <X />
                      </Button>
                    </div>
                  </div>
                </Card>
              )) : (
                <p className="text-sm text-muted-foreground">{t('ordersManager.products.empty')}</p>
              )}
            </div>
            <div className="rounded-2xl bg-muted/40 p-3 text-sm">
              <p>{t('ordersManager.amount.subtotal')}: {formatMoney(productSubtotal)}</p>
              <p>{t('ordersManager.amount.deliveryFee')}: {formatMoney(state?.order.deliveryFee ?? 0)}</p>
              <p className="font-semibold">{t('ordersManager.amount.total')}: {formatMoney(totalAmount)}</p>
            </div>
          </div>
        </div>
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
  onOpenChange,
  onPrint,
  onSearchChange,
  onAddProduct,
  onReset,
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
  onOpenChange: (open: boolean) => void;
  onPrint: () => void;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onReset: () => void;
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
  const groupedBrands = useMemo(() => {
    if (!state) {
      return [];
    }

    const brandGroupsMap = new Map<string, ShoppingListBrandGroup>();
    for (const product of state.draftItems) {
      const key = `${product.brandId ?? 'none'}:${product.brandName}`;
      const group = brandGroupsMap.get(key) ?? { brandId: product.brandId, brandName: product.brandName, products: [] };
      group.products.push(product);
      brandGroupsMap.set(key, group);
    }

    return [...brandGroupsMap.values()]
      .map((group) => ({
        ...group,
        products: [...group.products].sort((left, right) => left.title.localeCompare(right.title)),
      }))
      .sort((left, right) => left.brandName.localeCompare(right.brandName));
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{state?.title ?? t('ordersManager.shoppingList.title')}</DialogTitle>
          <DialogDescription>{t('ordersManager.shoppingList.description')}</DialogDescription>
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
                  <Button type="button" variant="outline" onClick={onReset}>
                    {t('ordersManager.shoppingList.reset')}
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
                {groupedBrands.map((group) => (
                  <div key={`${group.brandId ?? 'none'}-${group.brandName}`} className="rounded-xl border border-border/70 p-3">
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
            <div className="rounded-2xl border border-border/70 p-4">
              <div className="flex flex-col gap-4">
                {state.orders.map((order) => (
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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExportOrdersDialog({
  state,
  progress,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: ExportPreviewState;
  progress: ExportProgressState;
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

export function OrdersManager({
  initialOrders,
  initialCatalog,
}: {
  initialOrders?: OrdersResponse;
  initialCatalog?: EcotrackCatalogResponse;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrderSortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, AddressDraft>>({});
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const [detailsOrder, setDetailsOrder] = useState<OrderRecord | null>(null);
  const [historyOrder, setHistoryOrder] = useState<OrderRecord | null>(null);
  const [productsDialog, setProductsDialog] = useState<ProductsDialogState>(null);
  const [bulkStatus, setBulkStatus] = useState<string>('2');
  const [shoppingListState, setShoppingListState] = useState<ShoppingListState>(null);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [exportPreviewState, setExportPreviewState] = useState<ExportPreviewState>(null);
  const [ecotrackPreviewState, setEcotrackPreviewState] = useState<EcotrackPostingPreviewState>(null);
  const [activeEcotrackJobId, setActiveEcotrackJobId] = useState<string | null>(null);
  const [hoveredProductKey, setHoveredProductKey] = useState<string | null>(null);
  const [isFilterPending, startFilterTransition] = useTransition();
  const initializedExportStatusRef = useRef(false);
  const lastExportStatusKeyRef = useRef<string | null>(null);
  const initializedEcotrackStatusRef = useRef(false);
  const lastEcotrackStatusKeyRef = useRef<string | null>(null);
  const sessionStartedEcotrackJobIdsRef = useRef<Set<string>>(new Set());
  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const [initialOrdersUpdatedAt] = useState(() => (initialOrders ? Date.now() : 0));
  const [initialCatalogUpdatedAt] = useState(() => (initialCatalog ? Date.now() : 0));

  const ordersQuery = useQuery({
    queryKey: ['orders-table', page, deferredSearch, deferredStatusFilter, sortKey, sortDirection],
    queryFn: () => request<OrdersResponse>(`/api/orders?page=${page}&limit=25&search=${encodeURIComponent(deferredSearch)}&confirmed=${deferredStatusFilter === 'all' ? '' : deferredStatusFilter}&sortKey=${sortKey}&sortDirection=${sortDirection}`),
    initialData: initialOrders,
    initialDataUpdatedAt: initialOrdersUpdatedAt,
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
      toast.error(error.message || t('ordersManager.export.error'), { id: context?.toastId });
    },
    onSuccess: async (_data, _variables, context) => {
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
    { mode: 'selected' | 'confirmed'; orderIds: number[] },
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
    { mode: 'selected' | 'confirmed'; orderIds: number[] },
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
      toast.success(t('ordersManager.export.success'));
      if (orderExportJob.downloadPath) {
        window.open(orderExportJob.downloadPath, '_self');
      }
      queueMicrotask(() => setExportPreviewState(null));
      void queryClient.invalidateQueries({ queryKey: ['orders-table'] });
    } else if (orderExportJob.status === 'cancelled') {
      toast.success(t('products.exportAll.notifications.status.cancelled'));
    } else if (orderExportJob.status === 'failed') {
      toast.error(orderExportJob.errorMessage || t('ordersManager.export.error'));
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
      setSortDirection((current) => (sortKey === nextKey ? (current === 'asc' ? 'desc' : 'asc') : sortKey === nextKey ? current : nextKey === 'createdAt' ? 'desc' : 'asc'));
      setSortKey(nextKey);
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
  const getNoteDraft = (order: OrderRecord) => noteDrafts[order.id] ?? (order.note ?? '');
  const getAddressDraft = (order: OrderRecord): AddressDraft => addressDrafts[order.id] ?? {
    delivery: order.delivery,
    state: formatStateValue(order.state),
    city: normalizeCommuneValue(order.state, order.city, ecotrackCatalogQuery.data),
    homeAddress: order.homeAddress ?? '',
  };

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
      toast.success(t('notifications.orders.bulkStatus.success', { count: orders.length }), { id: toastId });
      setSelectedIds([]);
    } catch {
      toast.error(t('notifications.orders.bulkStatus.error', { count: orders.length }), { id: toastId });
    }
  }

  async function openShoppingListForOrders(orders: OrderRecord[], title: string) {
    if (orders.length === 0) {
      toast.error(t('ordersManager.shoppingList.emptySelection'));
      return;
    }

    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));

    try {
      const nextState = await buildShoppingListState(orders, 'selected', title);
      setShoppingListState(nextState);
      setShoppingListOpen(true);
      toast.success(t('ordersManager.shoppingList.ready'), { id: toastId });
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

  async function openStatusBasedShoppingList(status: 2 | 3, sourceMode: Exclude<ShoppingListSourceMode, 'selected'>) {
    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));

    try {
      const items = await fetchOrdersByStatus(status);

      if (items.length === 0) {
        toast.error(t(status === 2 ? 'ordersManager.shoppingList.emptyConfirmed' : 'ordersManager.shoppingList.emptyDispatched'), { id: toastId });
        return;
      }

      const nextState = await buildShoppingListState(
        items,
        sourceMode,
        t(status === 2 ? 'ordersManager.shoppingList.confirmedTitle' : 'ordersManager.shoppingList.dispatchedTitle'),
      );
      setShoppingListState(nextState);
      setShoppingListOpen(true);
      toast.success(t('ordersManager.shoppingList.ready'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function openConfirmedShoppingList() {
    await openStatusBasedShoppingList(2, 'confirmed');
  }

  async function openDispatchedShoppingList() {
    await openStatusBasedShoppingList(3, 'dispatched');
  }

  function openExportPreview(orders: OrderRecord[], mode: 'selected' | 'confirmed', title: string) {
    if (orders.length === 0) {
      toast.error(t('ordersManager.export.empty'));
      return;
    }

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
      const orders = await fetchOrdersByStatus(2);
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
      await startOrderExportMutation.mutateAsync({
        mode: exportPreviewState.mode,
        orderIds: exportPreviewState.orders.map((order) => order.id),
      });
    } catch {
      toast.error(t('ordersManager.export.error'));
    }
  }

  async function openEcotrackPreview(mode: 'selected' | 'confirmed', orderIds: number[], title: string) {
    if (orderIds.length === 0) {
      toast.error(t('ordersManager.ecotrack.empty'));
      return;
    }

    try {
      const preview = await previewOrderEcotrackMutation.mutateAsync({ mode, orderIds });
      setActiveEcotrackJobId(null);
      setEcotrackPreviewState({ mode, title, orderIds, preview });
    } catch {
      toast.error(t('ordersManager.ecotrack.error'));
    }
  }

  async function openSelectedOrdersEcotrackPreview() {
    await openEcotrackPreview('selected', selectedOrders.map((order) => order.id), t('ordersManager.ecotrack.selectedTitle', { count: selectedOrders.length }));
  }

  async function openConfirmedOrdersEcotrackPreview() {
    const orders = await fetchOrdersByStatus(2);
    if (orders.length === 0) {
      toast.error(t('ordersManager.ecotrack.emptyConfirmed'));
      return;
    }
    await openEcotrackPreview('confirmed', orders.map((order) => order.id), t('ordersManager.ecotrack.confirmedTitle', { count: orders.length }));
  }

  async function confirmEcotrackPosting() {
    if (!ecotrackPreviewState) {
      return;
    }

    try {
      const response = await startOrderEcotrackMutation.mutateAsync({
        mode: ecotrackPreviewState.mode,
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
    printWindow.document.write(buildShoppingListPrintHtml(shoppingListState));
    printWindow.document.close();
  }

  function updateShoppingListState(updater: (state: NonNullable<ShoppingListState>) => NonNullable<ShoppingListState>) {
    setShoppingListState((current) => (current ? updater(current) : current));
  }

  function updateShoppingListDraftItems(updater: (items: ShoppingListDraftItem[]) => ShoppingListDraftItem[]) {
    updateShoppingListState((current) => ({ ...current, draftItems: updater(current.draftItems) }));
  }

  function resetShoppingListDraft() {
    updateShoppingListState((current) => ({
      ...current,
      draftItems: current.generatedItems.map((item) => ({ ...item, notes: [...item.notes] })),
      search: '',
    }));
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
        };

        return {
          ...current,
          search: '',
          draftItems: [...current.draftItems, nextItem],
        };
      });
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
      <div className="border-b border-border/70 bg-linear-to-b from-background to-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('nav.orders')}</h2>
            <PendingInline active={isFilterPending || ordersQuery.isFetching} label={t('labels.loading')} />
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-background/90 p-3">
            <div className="flex flex-col gap-4">
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
                    });
                  }}
                >
                  <NativeSelectOption value="all">{t('ordersManager.filters.allStatuses')}</NativeSelectOption>
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
                </NativeSelect>
                <Badge variant="outline">{t('labels.bulkSelectionCount', { count: selectedIds.length })}</Badge>
                <NativeSelect aria-label={t('ordersManager.bulk.statusLabel')} value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="min-w-44">
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
                </NativeSelect>
                <Button type="button" variant="outline" disabled={!writable || selectedOrders.length === 0} onClick={() => void applyBulkStatus()}>
                  {t('ordersManager.bulk.applyStatus')}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <SplitActionButton
                  label={t('ordersManager.ecotrack.confirmedAction')}
                  icon={<Package data-icon="inline-start" />}
                  onPrimaryClick={() => void openConfirmedOrdersEcotrackPreview()}
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
                      onSelect: () => openSelectedOrdersEcotrackPreview(),
                      disabled: selectedOrders.length === 0,
                    },
                  ]}
                />
                <SplitActionButton
                  label={t('ordersManager.shoppingList.confirmedAction')}
                  icon={<ShoppingBasket data-icon="inline-start" />}
                  onPrimaryClick={() => void openConfirmedShoppingList()}
                  options={[
                    {
                      key: 'shopping-selected',
                      label: t('ordersManager.shoppingList.selectedAction'),
                      onSelect: () => openShoppingListForOrders(selectedOrders, t('ordersManager.shoppingList.selectedTitle', { count: selectedOrders.length })),
                      disabled: selectedOrders.length === 0,
                    },
                    {
                      key: 'shopping-dispatched',
                      label: t('ordersManager.shoppingList.dispatchedAction'),
                      onSelect: () => openDispatchedShoppingList(),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRefreshingProgress ? (
        <div className="px-4 pb-4 sm:px-5" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('ordersManager.loading.refreshing')}</span>
            <span>{t('ordersManager.loading.inProgress')}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/70" />
          </div>
        </div>
      ) : null}

      {isInitialLoading ? (
        <>
          <OrdersTableSkeleton />
          <OrdersMobileSkeleton />
        </>
      ) : null}

      {!isInitialLoading ? (
      <>
      {ordersQuery.isError ? (
        <div className="px-4 pb-4 sm:px-5">
          <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>{t('ordersManager.empty.title')}</EmptyTitle>
              <EmptyDescription>{ordersQuery.error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}
      <div className="hidden overflow-x-auto lg:block">
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
                <SortHeader label={t('ordersManager.columns.date')} active={sortKey === 'createdAt'} direction={sortDirection} onClick={() => toggleSort('createdAt')} />
              </TableHead>
              <TableHead className="min-w-[26rem]">
                <SortHeader label={t('ordersManager.columns.client')} active={sortKey === 'fullName'} direction={sortDirection} onClick={() => toggleSort('fullName')} />
              </TableHead>
              <TableHead className="min-w-60">{t('ordersManager.columns.products')}</TableHead>
              <TableHead className="min-w-80">{t('ordersManager.columns.address')}</TableHead>
              <TableHead className="min-w-52">{t('ordersManager.columns.amount')}</TableHead>
              <TableHead className="min-w-48">
                <SortHeader label={t('ordersManager.columns.status')} active={sortKey === 'confirmed'} direction={sortDirection} onClick={() => toggleSort('confirmed')} />
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
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="rounded-[1.15rem] border border-border/70 bg-background p-3">
                      <p className="text-balance font-semibold text-foreground">{order.fullName}</p>
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
                        <Button type="button" size="sm" disabled={!writable} onClick={() => void saveAddress(order)}>
                          {t('actions.save')}
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {[selectedWilaya?.name ?? (order.state ? String(order.state) : ''), selectedCommune?.name ?? order.city].filter(Boolean).join(' / ') || t('ordersManager.placeholders.region')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="rounded-[1.15rem] border border-border/70 bg-muted/15 p-3 text-sm">
                      <p className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('ordersManager.amount.subtotal')}</span>
                        <span className="font-medium text-foreground">{formatMoney(order.productSubtotal)}</span>
                      </p>
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
                        <NativeSelectOption value="3">{t('ordersManager.status.dispatched')}</NativeSelectOption>
                        <NativeSelectOption value="4">{t('ordersManager.status.completed')}</NativeSelectOption>
                        <NativeSelectOption value="5">{t('ordersManager.status.delayed')}</NativeSelectOption>
                        <NativeSelectOption value="6">{t('ordersManager.status.cancelled')}</NativeSelectOption>
                        <NativeSelectOption value="7">{t('ordersManager.status.inDelivery')}</NativeSelectOption>
                        <NativeSelectOption value="8">{t('ordersManager.status.returned')}</NativeSelectOption>
                        <NativeSelectOption value="9">{t('ordersManager.status.failed')}</NativeSelectOption>
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

      <div className="grid gap-3 px-4 pb-4 lg:hidden">
        {paginatedOrders.map((order) => {
          const createdAt = formatDateParts(order.createdAt);
          const noteDraft = getNoteDraft(order);
          const addressDraft = getAddressDraft(order);
          const wilayaId = Number.parseInt(addressDraft.state, 10);
          const wilayaOptions = ecotrackCatalogQuery.data?.wilayas ?? [];
          const communeOptions = Number.isInteger(wilayaId)
            ? (ecotrackCatalogQuery.data?.communes ?? []).filter((entry) => entry.wilayaId === wilayaId)
            : [];
          const previewDeliveryFee = resolveDeliveryFeePreview(ecotrackCatalogQuery.data, addressDraft.delivery, addressDraft.state, order.deliveryFee);
          const phoneHref = buildPhoneTelHref(getPhoneDraft(order));

          return (
            <Card key={order.id} className="rounded-[1.5rem] border border-border/70 bg-background/95 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    aria-label={t('labels.selectRow', { name: order.fullName })}
                    checked={selectedIds.includes(order.id)}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked ? [...new Set([...current, order.id])] : current.filter((id) => id !== order.id),
                      );
                    }}
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold">{order.fullName}</p>
                    {order.isDegradedCapture ? (
                      <Badge variant="outline" className="mt-2 rounded-full">
                        {t('ordersManager.capture.degraded')}
                      </Badge>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">#{order.id}</p>
                    <p className="text-sm text-muted-foreground">{createdAt.date}</p>
                    <p className="text-xs text-muted-foreground">{createdAt.time}</p>
                  </div>
                </div>
                <Badge className="shrink-0">{formatOrderStatusLabel(t, order.confirmed, order.noAnswerCount)}</Badge>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <details open className="group rounded-2xl border border-border/70 bg-muted/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.client')}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t('ordersManager.phone.label')}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <p className="mb-3 font-mono text-sm font-medium tracking-[0.08em] text-foreground">
                      {formatPhoneForDisplay(order.phoneNumber1) || t('ordersManager.unconfirmed')}
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Input
                        className="min-w-[13rem] flex-1 basis-48 font-mono tracking-[0.08em]"
                        value={getPhoneDraft(order)}
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
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" size="sm" className="size-9 shrink-0 px-0" variant="outline" aria-label={t('ordersManager.copy.label')} onClick={() => void handleCopyPhone(order)}>
                          <Copy />
                        </Button>
                        <Button type="button" size="sm" className="size-9 shrink-0 px-0" disabled={!writable} aria-label={t('ordersManager.phone.save')} onClick={() => void savePhone(order)}>
                          <Save />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="size-9 shrink-0 px-0"
                          variant="outline"
                          disabled={!writable}
                          aria-label={t('ordersManager.phone.cancel')}
                          onClick={() => setPhoneDrafts((current) => ({ ...current, [order.id]: formatPhoneForDisplay(order.phoneNumber1) }))}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.products')}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t('ordersManager.actions.editProducts')}</span>
                  </summary>
                  <div className="px-3 pb-3">
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
                    <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setProductsDialog(buildProductsDialogState(order))}>
                      <Package data-icon="inline-start" />
                      {t('ordersManager.actions.editProducts')}
                    </Button>
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.amount')}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatMoney(order.productSubtotal + previewDeliveryFee)}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <p className="text-sm text-muted-foreground">{t('ordersManager.amount.subtotal')}: <span className="text-foreground">{formatMoney(order.productSubtotal)}</span></p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('ordersManager.amount.deliveryFee')}: <span className="text-foreground">{formatMoney(previewDeliveryFee)}</span></p>
                    <p className="mt-2 text-sm font-semibold">{t('ordersManager.amount.total')}: {formatMoney(order.productSubtotal + previewDeliveryFee)}</p>
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.status')}</span>
                    <span className="min-w-0 whitespace-normal text-right text-xs text-muted-foreground">{formatOrderStatusLabel(t, order.confirmed, order.noAnswerCount)}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <NativeSelect
                      className="mt-1"
                      aria-label={t('ordersManager.columns.status')}
                      value={String(order.confirmed)}
                      disabled={!writable}
                      onChange={(event) => updateOrderStatus(order, Number(event.target.value) as OrderRecord['confirmed'])}
                    >
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
                    </NativeSelect>
                    {order.confirmed === 1 ? (
                      <NoAnswerCounter
                        compact
                        count={Math.max(order.noAnswerCount, 1)}
                        disabled={!writable}
                        onDecrease={() => updateOrderStatus(order, 1, Math.max(order.noAnswerCount - 1, 1))}
                        onIncrease={() => updateOrderStatus(order, 1, order.noAnswerCount + 1)}
                      />
                    ) : null}
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.address')}</span>
                    <span className="min-w-0 whitespace-normal text-right text-xs text-muted-foreground">{[wilayaOptions.find((entry) => String(entry.wilayaId) === addressDraft.state)?.name, communeOptions.find((entry) => String(entry.communeId) === addressDraft.city)?.name].filter(Boolean).join(' / ') || t('ordersManager.placeholders.region')}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-2">
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
                      <Input
                        className="col-span-2"
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
                    </div>
                    <Button type="button" size="sm" className="mt-2 w-full" disabled={!writable} onClick={() => void saveAddress(order)}>
                      {t('actions.save')}
                    </Button>
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.confirmedBy')}</span>
                    <span className="min-w-0 whitespace-normal text-right text-xs text-muted-foreground">{order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <p className="font-semibold text-foreground">{order.confirmedByName ?? order.confirmedBy ?? t('ordersManager.unconfirmed')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{order.confirmedAt ? `${formatDateParts(order.confirmedAt).date} ${formatDateParts(order.confirmedAt).time}` : t('ordersManager.unconfirmedDate')}</p>
                    {order.hasStatusHistory ? (
                      <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => setHistoryOrder(order)}>
                        <History data-icon="inline-start" />
                        {t('ordersManager.history.button')}
                      </Button>
                    ) : null}
                  </div>
                </details>

                <details className="group rounded-2xl border border-border/70 bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 whitespace-normal text-left">{t('ordersManager.columns.notes')}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t('ordersManager.notes.save')}</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <Input
                      className="mt-1"
                      value={noteDraft}
                      disabled={!writable}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveNote(order);
                        }
                      }}
                    />
                    <Button type="button" size="sm" className="mt-3 w-full" disabled={!writable} onClick={() => void saveNote(order)}>
                      <Save data-icon="inline-start" />
                      {t('ordersManager.notes.save')}
                    </Button>
                  </div>
                </details>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" onClick={() => setDetailsOrder(order)}>
                    <Eye data-icon="inline-start" />
                    {t('ordersManager.actions.viewDetails')}
                  </Button>
                  <Button type="button" variant="destructive" disabled={!writable} onClick={() => setDeleteState({ id: order.id, label: order.fullName })}>
                    <Trash2 data-icon="inline-start" />
                    {t('actions.delete')}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {((ordersQuery.data?.pagination?.totalItems ?? ordersQuery.data?.items.length) ?? 0) === 0 ? (
        <div className="px-4 pb-4">
          <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>{t('ordersManager.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('ordersManager.empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}

      <TablePaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))} />

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
        onOpenChange={setShoppingListOpen}
        onPrint={openShoppingListPrintView}
        onSearchChange={(value) => updateShoppingListState((current) => ({ ...current, search: value }))}
        onAddProduct={(product) => void addProductToShoppingList(product)}
        onReset={resetShoppingListDraft}
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
        onOpenChange={(open) => {
          if (!open && !exportProgressState) {
            setExportPreviewState(null);
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
      </>) : null}
    </motion.section>
  );
}
