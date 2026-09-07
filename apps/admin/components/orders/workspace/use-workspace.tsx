'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStorefrontBaseUrl } from '../../storefront-origin';

import { requestJson as request } from '../../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../../lib/ecotrack-admin-contracts';
import type {
  DailyOrderStatusOverview,
  OrdersResponse,
  ProfitProjectionBasis,
} from '../../../lib/order-admin-contracts';
import { buildOrderTrackingUrl } from '../../../lib/order-tracking-link';
import {
  ORDER_STATUS,
  type OrderPatch,
  type OrderRecord,
  type OrderStatus,
} from '../../../lib/orders';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';

type OrderDetailResponse = { ok: true; item: OrderRecord };
type TrackingTokenResponse = { ok: true; publicToken: string };
type DeleteTarget = { id: number; label: string };
type NoAnswerAttemptFilter = 'all' | 1 | 2 | '3-plus';

export const noAnswerAttemptFilters: NoAnswerAttemptFilter[] = ['all', 1, 2, '3-plus'];
export const ordersOverviewQueryKey = ['orders-overview'] as const;

export function useOrdersWorkspace({
  initialOrders,
  operatorId,
  initialCatalog,
  initialOverview,
}: {
  initialOrders: OrdersResponse;
  operatorId?: string;
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

  return {
    view: {
      t,
      pagination,
      orders,
      operatorId,
      initialCatalog,
      writable,
      openOrderById,
      setOpenedOrder,
      focusOrder,
      queryClient,
      overviewQuery,
      projectionBasis,
      changeProjectionBasis,
      search,
      setSearch,
      setPage,
      setSelectedIds,
      setActiveOrderId,
      statusFilter,
      mobileFiltersOpen,
      selectStatusFilter,
      activeFilterCount,
      setMobileFiltersOpen,
      selectedOrders,
      activeOrderId,
      activeOrder,
      ordersQuery,
      allVisibleSelected,
      noAnswerAttemptFilter,
      selectNoAnswerAttemptFilter,
      selectedIds,
      bulkStatus,
      bulkStatusMutation,
      setBulkStatus,
      locale,
      storefrontBaseUrl,
      copyTrackingLink,
      setDeleteTarget,
      changePage,
      returnToQueue,
      patchMutation,
      saveOrder,
      deleteTarget,
      deleteMutation,
    } as const,
    fallback: null,
  };
}
