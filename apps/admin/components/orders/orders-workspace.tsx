'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  MessageSquareText,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useStorefrontBaseUrl } from '../storefront-origin';
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
import { NativeSelect } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
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
import { OrdersPulse } from './orders-pulse';
import {
  formatOrderDate,
  formatOrderListTimestamp,
  formatOrderMoney,
  orderStatusOptions,
  orderStatusTone,
  summarizeOrderProducts,
} from './orders-workspace-presenters';

type OrderDetailResponse = { ok: true; item: OrderRecord };
type TrackingTokenResponse = { ok: true; publicToken: string };
type DeleteTarget = { id: number; label: string };
type NoAnswerAttemptFilter = 'all' | 1 | 2 | '3-plus';

const noAnswerAttemptFilters: NoAnswerAttemptFilter[] = ['all', 1, 2, '3-plus'];
const ordersOverviewQueryKey = ['orders-overview'] as const;

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
  const storefrontBaseUrl = useStorefrontBaseUrl();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [noAnswerAttemptFilter, setNoAnswerAttemptFilter] = useState<NoAnswerAttemptFilter>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [openedOrder, setOpenedOrder] = useState<OrderRecord | null>(null);
  const queueScrollTopRef = useRef(0);
  const restoreQueueScrollRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>(ORDER_STATUS.CONFIRMED);
  const [projectionBasis, setProjectionBasis] = useState<ProfitProjectionBasis>('confirmed');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const effectiveNoAnswerAttemptFilter =
    statusFilter === ORDER_STATUS.NO_ANSWER ? noAnswerAttemptFilter : 'all';
  const activeFilterCount =
    (statusFilter === 'all' ? 0 : 1) + (effectiveNoAnswerAttemptFilter === 'all' ? 0 : 1);
  const selectStatusFilter = (status: 'all' | OrderStatus) => {
    setStatusFilter(status);
    if (status !== ORDER_STATUS.NO_ANSWER) setNoAnswerAttemptFilter('all');
    setPage(1);
    setSelectedIds([]);
    setActiveOrderId(null);
  };
  const selectNoAnswerAttemptFilter = (filter: NoAnswerAttemptFilter) => {
    setNoAnswerAttemptFilter(filter);
    setPage(1);
    setSelectedIds([]);
    setActiveOrderId(null);
  };
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
      noAnswerAttempts: effectiveNoAnswerAttemptFilter,
      projectionBasis,
    },
    selection: {
      entityType: 'order',
      ids: selectedIds,
      focusedId: activeOrderId,
    },
  });
  const ordersQuery = useQuery({
    queryKey: [
      'orders-workspace',
      page,
      deferredSearch,
      statusFilter,
      effectiveNoAnswerAttemptFilter,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        search: deferredSearch,
        inHouseStatus: statusFilter === 'all' ? '' : String(statusFilter),
      });
      if (effectiveNoAnswerAttemptFilter === 1 || effectiveNoAnswerAttemptFilter === 2) {
        params.set('noAnswerCount', String(effectiveNoAnswerAttemptFilter));
      } else if (effectiveNoAnswerAttemptFilter === '3-plus') {
        params.set('noAnswerCountMin', '3');
      }
      return request<OrdersResponse>(`/api/orders?${params.toString()}`, { signal });
    },
    initialData:
      page === 1 &&
      deferredSearch === '' &&
      statusFilter === 'all' &&
      effectiveNoAnswerAttemptFilter === 'all'
        ? initialOrders
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const overviewQuery = useQuery({
    queryKey: [...ordersOverviewQueryKey, projectionBasis, 7],
    queryFn: () =>
      request<{ overview: DailyOrderStatusOverview }>(
        `/api/orders/overview?projectionBasis=${projectionBasis}&reportDays=7`,
      ),
    initialData:
      projectionBasis === 'confirmed' && initialOverview
        ? { overview: initialOverview }
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
  useEffect(() => {
    if (overviewQuery.error) toast.error(overviewQuery.error.message);
  }, [overviewQuery.error]);
  const changeProjectionBasis = (basis: ProfitProjectionBasis) => {
    setProjectionBasis(basis);
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
      void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
      await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveOrder = async (order: OrderRecord, patch: OrderPatch) => {
    try {
      const response = await patchMutation.mutateAsync({ id: order.id, patch });
      return response.item;
    } catch {
      // The mutation reports the failure; keep the editor draft available for retry.
      return null;
    }
  };
  const bulkStatusMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        selectedOrders.map(async (order) => {
          const response = await request<OrderDetailResponse>(`/api/orders/${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              inHouseStatus: bulkStatus,
              noAnswerCount:
                bulkStatus === ORDER_STATUS.NO_ANSWER ? Math.max(order.noAnswerCount, 1) : 0,
            }),
          });
          return { orderId: order.id, response };
        }),
      );
      return results.reduce(
        (summary, result, index) => {
          if (result.status === 'fulfilled') {
            summary.succeeded.push(result.value);
          } else {
            summary.failedIds.push(selectedOrders[index]!.id);
          }
          return summary;
        },
        {
          succeeded: [] as Array<{ orderId: number; response: OrderDetailResponse }>,
          failedIds: [] as number[],
        },
      );
    },
    onSuccess: async (result) => {
      if (result.succeeded.length > 0) {
        toast.success(
          t('notifications.orders.bulkStatus.success', { count: result.succeeded.length }),
        );
      }
      if (result.failedIds.length > 0) {
        toast.error(t('notifications.orders.bulkStatus.error', { count: result.failedIds.length }));
      }
      setSelectedIds(result.failedIds);
      void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['orders-workspace-detail'] }),
      ]);
    },
    onError: async () => {
      toast.error(t('notifications.orders.bulkStatus.error', { count: selectedOrders.length }));
      void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['orders-workspace-detail'] }),
      ]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteTarget) =>
      request<{ ok: true }>(`/api/orders/${id}`, { method: 'DELETE' }),
    onSuccess: async (_response, target) => {
      toast.success(t('notifications.orders.delete.success', { target: target.label }));
      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => id !== target.id));
      if (activeOrderId === target.id) returnToQueue();
      void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
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
      const trackingUrl = buildOrderTrackingUrl(publicToken, locale, storefrontBaseUrl);
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
                void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
                await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
              }}
            />
          </WorkspaceActions>
        </WorkspaceHeader>
        <OrdersPulse
          overview={overviewQuery.data?.overview}
          projectionBasis={projectionBasis}
          loading={overviewQuery.isPending || overviewQuery.isFetching}
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
              selectStatusFilter(
                event.target.value === 'all' ? 'all' : (Number(event.target.value) as OrderStatus),
              );
            }}
          >
            <option value="all">{t('ordersManager.filters.allStatuses')}</option>
            {orderStatusOptions.map((status) => (
              <option key={status} value={status}>
                {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            variant={mobileFiltersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
            className="sm:hidden"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t('adminWorkspace.common.filters')}
            {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
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
                  onClick={() => selectStatusFilter(status)}
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
            {statusFilter === ORDER_STATUS.NO_ANSWER ? (
              <div className="flex items-center gap-3 overflow-x-auto border-b border-border/60 px-3 py-1.5">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {t('adminWorkspace.orders.noAnswerAttempts')}
                </span>
                <div className="flex items-center gap-1">
                  {noAnswerAttemptFilters.map((filter) => {
                    const ariaLabel =
                      filter === 'all'
                        ? t('ordersManager.filters.allNoAnswerCounts')
                        : filter === '3-plus'
                          ? t('ordersManager.filters.noAnswerCountAtLeast', { count: 3 })
                          : t('ordersManager.status.noAnswerWithCount', { count: filter });
                    const label =
                      filter === 'all'
                        ? t('adminWorkspace.common.all')
                        : filter === '3-plus'
                          ? '3+'
                          : String(filter);

                    return (
                      <button
                        key={filter}
                        type="button"
                        aria-label={ariaLabel}
                        aria-pressed={noAnswerAttemptFilter === filter}
                        dir={filter === '3-plus' ? 'ltr' : undefined}
                        onClick={() => selectNoAnswerAttemptFilter(filter)}
                        className={cn(
                          'min-w-8 shrink-0 border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                          noAnswerAttemptFilter === filter
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
                      <option key={status} value={status}>
                        {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                      </option>
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
                const trackingUrl = buildOrderTrackingUrl(
                  order.publicToken,
                  locale,
                  storefrontBaseUrl,
                );
                const note = order.note?.trim();
                const statusLabel =
                  order.inHouseStatus === ORDER_STATUS.NO_ANSWER
                    ? t('ordersManager.status.noAnswerWithCount', {
                        count: order.noAnswerCount,
                      })
                    : t(`ordersManager.status.${getOrderStatusLabelKey(order.inHouseStatus)}`);

                return (
                  <div
                    key={order.id}
                    className={cn(
                      'group relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-3 py-3.5 transition-colors hover:bg-primary/[0.035] sm:px-4 sm:py-4',
                      activeOrderId === order.id && 'bg-primary/[0.055]',
                    )}
                  >
                    <span className="pt-1">
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
                    </span>
                    <button
                      type="button"
                      onClick={() => focusOrder(order.id)}
                      className="min-w-0 rounded-sm text-start focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                    >
                      <span
                        className={cn(
                          'flex min-w-0 items-baseline gap-2',
                          trackingUrl ? 'pe-[4.75rem]' : 'pe-10',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {order.fullName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">#{order.id}</span>
                      </span>
                      <span className="mt-2 flex min-w-0 items-center justify-between gap-3 pe-[4.75rem]">
                        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium">
                          <span
                            className={cn(
                              'size-2 shrink-0 rounded-full',
                              orderStatusTone(order.inHouseStatus),
                            )}
                            aria-hidden="true"
                          />
                          {statusLabel}
                        </span>
                        <time
                          dateTime={order.createdAt}
                          title={formatOrderDate(locale, order.createdAt, true)}
                          dir="ltr"
                          className="shrink-0 whitespace-nowrap text-[length:var(--type-size-caption)] font-normal tabular-nums"
                        >
                          {formatOrderListTimestamp(locale, order.createdAt)}
                        </time>
                      </span>
                      <span className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                          {summarizeOrderProducts(order)} ·{' '}
                          {formatOrderRegionLabel(
                            initialCatalog,
                            order.state,
                            order.city,
                            t('adminWorkspace.orders.noLocation'),
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                          {formatOrderMoney(locale, order.totalAmount)}
                        </span>
                      </span>
                      {note ? (
                        <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                          <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{note}</span>
                        </span>
                      ) : null}
                    </button>
                    <div className="absolute end-3 top-3.5 flex items-center gap-0.5 sm:end-4 sm:top-4">
                      {trackingUrl ? (
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('adminWorkspace.orders.openTracking', {
                            name: order.fullName,
                          })}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                        >
                          <ExternalLink className="size-4" aria-hidden="true" />
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
