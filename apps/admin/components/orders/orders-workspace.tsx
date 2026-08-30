'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useLayoutEffect, useRef, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import type {
  DailyOrderStatusOverview,
  OrdersResponse,
  ProfitProjectionBasis,
} from '../../lib/order-admin-contracts';
import { buildOrderTrackingUrl } from '../../lib/order-tracking-link';
import { formatOrderRegionLabel } from '../../lib/order-presentation';
import {
  getOrderStatusLabelKey,
  ORDER_STATUS,
  type OrderPatch,
  type OrderRecord,
  type OrderStatus,
} from '../../lib/orders';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { WorkspacePagination } from '../ui/workspace-pagination';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { OrdersWorkflows } from './orders-workflows';
import { OrderSalesDesk } from './order-sales-desk';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { SearchField } from '../search-field';
import { OrderEditor } from './order-editor';
import {
  formatOrderMoney,
  orderStatusOptions,
  orderStatusTone,
  summarizeOrderProducts,
} from './orders-workspace-presenters';

type OrderDetailResponse = { ok: true; item: OrderRecord };
type TrackingTokenResponse = { ok: true; publicToken: string };
type DeleteTarget = { id: number; label: string };

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
  const projectionMoney = (value: number | null | undefined) =>
    value == null ? '—' : formatOrderMoney(locale, value);
  const updates = activeReport.confirmationStatusChanges + activeReport.shipmentUpdates;
  const cancellations = activeReport.adminCancelled + activeReport.carrierCancelled;

  return (
    <section data-orders-pulse className="border-b border-border/60 bg-card/30 p-2.5">
      <div
        className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5"
        data-mobile-projection-controls
      >
        <p className="order-1 min-w-0 truncate text-xs font-medium capitalize">
          {formatReportDay(activeReport.reportDay)}
        </p>
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
          className="absolute inset-x-4 inset-y-0 translate-y-2 scale-[0.97] rounded-[var(--shape-radius-card-compact)] border border-border/45 bg-background/45"
        />
        <div
          aria-hidden="true"
          data-projection-stack-layer
          className="absolute inset-x-2 inset-y-0 translate-y-1 scale-[0.985] rounded-[var(--shape-radius-card-compact)] border border-border/55 bg-background/70 shadow-[var(--shadow-vapor)]"
        />
        <article
          key={activeReport.reportDay}
          aria-live="polite"
          className={cn(
            'relative z-10 overflow-hidden rounded-[var(--shape-radius-card-compact)] border border-border/65 bg-background shadow-[var(--shadow-vapor-strong)] transition-opacity',
            loading && 'opacity-65',
          )}
        >
          <div className="divide-y divide-border/55 sm:hidden" data-mobile-projection-summary>
            <div className="flex items-end justify-between gap-4 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[length:var(--type-size-label)] text-muted-foreground">
                  {t('projectedProfit')}
                </p>
                <p className="mt-0.5 truncate text-xl font-semibold tracking-[var(--type-tracking-n020)] tabular-nums">
                  {projectionMoney(projection?.projectedProfit)}
                </p>
              </div>
              <p className="shrink-0 pb-0.5 text-xs text-muted-foreground">
                {t('grossShort')}{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {projectionMoney(projection?.grossProfit)}
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
                  <dt className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 text-xs [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground">
                  {overviewT('projection.adSpend')} · {t('updates')}
                </span>
                <span className="ms-auto font-medium tabular-nums">
                  {projectionMoney(projection?.adSpend)} · {updates}
                </span>
                <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <dl className="grid grid-cols-2 border-t border-border/55 bg-muted/15">
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {overviewT('projection.adSpend')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projectionMoney(projection?.adSpend)}
                  </dd>
                </div>
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {overviewT('projection.returnLoss')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projectionMoney(projection?.estimatedReturnLoss)}
                  </dd>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {t('updates')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{updates}</dd>
                  <p className="truncate text-[length:var(--type-size-micro)] text-muted-foreground">
                    {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                    {activeReport.shipmentUpdates} {t('shipmentShort')}
                  </p>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {t('cancelled')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{cancellations}</dd>
                  <p className="truncate text-[length:var(--type-size-micro)] text-muted-foreground">
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
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('projectedProfit')}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-[var(--type-tracking-n020)] tabular-nums">
                {projectionMoney(projection?.projectedProfit)}
              </p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                {t('grossShort')} {projectionMoney(projection?.grossProfit)}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {overviewT('projection.adSpend')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projectionMoney(projection?.adSpend)}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {overviewT('projection.returnLoss')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projectionMoney(projection?.estimatedReturnLoss)}
              </p>
              {projection ? (
                <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
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
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('ordersSummary')}
              </p>
              <dl className="mt-1 grid grid-cols-3 gap-2">
                {[
                  [t('newShort'), activeReport.newOrders],
                  [t('confirmedShort'), activeReport.confirmedToday],
                  [t('noAnswerShort'), activeReport.noAnswerOrders],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col">
                    <dt className="order-2 truncate text-[length:var(--type-size-micro)] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="order-1 text-base font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('updates')}
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{updates}</p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                {activeReport.shipmentUpdates} {t('shipmentShort')}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('cancelled')}
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{cancellations}</p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
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
  const queueScrollTopRef = useRef(0);
  const restoreQueueScrollRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>(ORDER_STATUS.CONFIRMED);
  const [projectionBasis, setProjectionBasis] = useState<ProfitProjectionBasis>('confirmed');
  const [overviewByBasis, setOverviewByBasis] = useState<
    Partial<Record<ProfitProjectionBasis, DailyOrderStatusOverview>>
  >(() => (initialOverview ? { confirmed: initialOverview } : {}));
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const focusOrder = (orderId: number) => {
    if (activeOrderId === null) queueScrollTopRef.current = window.scrollY;
    restoreQueueScrollRef.current = false;
    setActiveOrderId(orderId);
  };
  const returnToQueue = () => {
    restoreQueueScrollRef.current = true;
    setActiveOrderId(null);
  };
  useLayoutEffect(() => {
    if (activeOrderId !== null || !restoreQueueScrollRef.current) return;
    restoreQueueScrollRef.current = false;
    window.scrollTo({ top: queueScrollTopRef.current, left: 0, behavior: 'auto' });
  }, [activeOrderId]);
  useAdminAiSurfaceDetails({
    filters: {
      page,
      status: statusFilter,
      projectionBasis,
    },
    selection: {
      entityType: 'order',
      ids: selectedIds,
      focusedId: activeOrderId,
    },
  });
  const ordersQuery = useQuery({
    queryKey: ['orders-workspace', page, deferredSearch, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        search: deferredSearch,
        inHouseStatus: statusFilter === 'all' ? '' : String(statusFilter),
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
              inHouseStatus: bulkStatus,
              noAnswerCount:
                bulkStatus === ORDER_STATUS.NO_ANSWER ? Math.max(order.noAnswerCount, 1) : 0,
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
      if (activeOrderId === target.id) returnToQueue();
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
      focusOrder(orderId);
      return;
    }
    try {
      const response = await request<OrderDetailResponse>(`/api/orders/${orderId}`);
      setOpenedOrder(response.item);
      focusOrder(response.item.id);
      queryClient.setQueryData(['orders-workspace-detail', response.item.id], response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('notifications.orders.load.error'));
    }
  };

  return (
    <>
      <WorkspaceFrame className="overflow-hidden" data-admin-workspace="orders">
        <WorkspaceHeader>
          <WorkspaceHeading
            title={t('nav.orders')}
            meta={t('adminWorkspace.orders.resultCount', {
              count: pagination?.totalItems ?? orders.length,
            })}
          />
          <WorkspaceActions>
            <OrderSalesDesk
              catalog={initialCatalog}
              writable={writable}
              onOpenOrder={(id) => void openOrderById(id)}
              onCreated={async (order) => {
                setOpenedOrder(order);
                focusOrder(order.id);
                await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
              }}
            />
          </WorkspaceActions>
        </WorkspaceHeader>
        <OrdersPulse
          overview={overviewByBasis[projectionBasis] ?? overviewByBasis.confirmed}
          projectionBasis={projectionBasis}
          loading={overviewMutation.isPending && overviewMutation.variables === projectionBasis}
          onProjectionBasisChange={changeProjectionBasis}
        />
        <WorkspaceToolbar className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <SearchField
            value={search}
            label={t('adminWorkspace.common.search')}
            placeholder={t('adminWorkspace.orders.searchPlaceholder')}
            className="flex-1"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
              setSelectedIds([]);
              setActiveOrderId(null);
            }}
          />
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
            {orderStatusOptions.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
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
        </WorkspaceToolbar>

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
              {(
                [
                  'all',
                  ORDER_STATUS.NOT_CONTACTED,
                  ORDER_STATUS.NO_ANSWER,
                  ORDER_STATUS.CONFIRMED,
                  ORDER_STATUS.POSTED,
                ] as const
              ).map((status) => (
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
                    'shrink-0 rounded-[var(--shape-radius-soft-sm)] px-3 py-1.5 text-sm font-medium transition-colors',
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
                  {orderStatusOptions
                    .filter((status) => status !== ORDER_STATUS.POSTED)
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
                      onClick={() => focusOrder(order.id)}
                      className="min-w-0 rounded-sm text-start focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            orderStatusTone(order.inHouseStatus),
                          )}
                        />
                        <span className="truncate text-sm font-semibold">{order.fullName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">#{order.id}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {summarizeOrderProducts(order)} ·{' '}
                        {formatOrderRegionLabel(
                          initialCatalog,
                          order.state,
                          order.city,
                          t('adminWorkspace.orders.noLocation'),
                        )}
                      </span>
                      <span className="mt-1.5 flex min-w-0 items-center gap-3">
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatOrderMoney(locale, order.totalAmount)}
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
                          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                        >
                          <ExternalLink className="size-4" aria-hidden="true" />
                          <span className="hidden min-[390px]:inline">
                            {t('adminWorkspace.orders.tracking')}
                          </span>
                        </a>
                      ) : null}
                      <CompactMenu label={`${t('labels.actions')} · ${order.fullName}`}>
                        <CompactMenuItem onClick={() => focusOrder(order.id)}>
                          <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                          <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
                          {t('actions.edit')}
                        </CompactMenuItem>
                        <CompactMenuItem onClick={() => void copyTrackingLink(order)}>
                          <Copy className="size-4" aria-hidden="true" />
                          {t('ordersManager.tracking.copy')}
                        </CompactMenuItem>
                        <CompactMenuItem
                          destructive
                          disabled={!writable}
                          onClick={() => setDeleteTarget({ id: order.id, label: order.fullName })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          {t('actions.delete')}
                        </CompactMenuItem>
                      </CompactMenu>
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
            {pagination ? (
              <WorkspacePagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                pending={ordersQuery.isFetching}
                onPageChange={changePage}
              />
            ) : null}
          </section>

          <aside
            className={cn(
              'min-w-0 bg-card/20 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto',
              activeOrderId !== null && activeOrder !== null ? 'block' : 'hidden',
            )}
          >
            <div className="border-b border-border/60 px-3 py-2 lg:hidden">
              <Button type="button" size="sm" variant="outline" onClick={returnToQueue}>
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
      </WorkspaceFrame>
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
