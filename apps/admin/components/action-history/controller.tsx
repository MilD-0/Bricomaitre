'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';
import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { useMediaQuery } from '../ui/use-media-query';
import {
  dayKey,
  wideLayoutQuery,
  type HistoryDetailItem,
  type HistoryDetailResponse,
  type HistoryListItem,
  type HistoryListResponse,
  type HistoryOperationFilter,
  type HistoryResourceFilter,
  type HistoryState,
} from './contract';
import { formatDay, HistoryInspector } from './inspector';

export function useActionHistoryPanel({
  invalidateQueryKeys = [],
  className,
}: {
  invalidateQueryKeys?: Array<readonly unknown[]>;
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const isWideLayout = useMediaQuery(wideLayoutQuery);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState<HistoryOperationFilter>('all');
  const [resource, setResource] = useState<HistoryResourceFilter>('all');
  const [state, setState] = useState<HistoryState>('all');
  const [includeEcotrackSync, setIncludeEcotrackSync] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{
    direction: 'undo' | 'redo';
    item: HistoryDetailItem;
  } | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const historyQuery = useQuery({
    queryKey: [
      'action-history',
      page,
      deferredSearch,
      operation,
      resource,
      state,
      includeEcotrackSync,
      sortDirection,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        search: deferredSearch,
        operation,
        resource,
        state,
        includeEcotrackSync: String(includeEcotrackSync),
        sortKey: 'createdAt',
        sortDirection,
      });
      return request<HistoryListResponse>(`/api/action-history?${params.toString()}`);
    },
    initialData: {
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const effectiveSelectedId = historyQuery.data.items.some((item) => item.id === selectedId)
    ? selectedId
    : (historyQuery.data.items[0]?.id ?? null);
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      operation,
      resource,
      state,
      includeEcotrackSync,
      sortDirection,
    },
    selection: effectiveSelectedId
      ? { entityType: 'actionLog', ids: [effectiveSelectedId], focusedId: effectiveSelectedId }
      : null,
  });
  const detailQuery = useQuery({
    queryKey: ['action-history', 'detail', effectiveSelectedId],
    queryFn: () => request<HistoryDetailResponse>(`/api/action-history/${effectiveSelectedId}`),
    enabled: effectiveSelectedId !== null,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; items: HistoryListItem[] }> = [];
    for (const item of historyQuery.data.items) {
      const key = dayKey(item.createdAt);
      const current = result.at(-1);
      if (current?.key === key) current.items.push(item);
      else result.push({ key, label: formatDay(item.createdAt, locale, t), items: [item] });
    }
    return result;
  }, [historyQuery.data.items, locale, t]);

  const activeFilterCount =
    Number(operation !== 'all') +
    Number(resource !== 'all') +
    Number(state !== 'all') +
    Number(includeEcotrackSync);
  const hasActiveFilters = activeFilterCount > 0 || deferredSearch.length > 0;

  async function refreshHistory() {
    await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    await Promise.all(
      invalidateQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  }

  const recoveryMutation = useMutation({
    mutationFn: ({ direction, item }: { direction: 'undo' | 'redo'; item: HistoryDetailItem }) =>
      request(`/api/action-history/${item.id}/${direction}`, { method: 'POST' }),
    onMutate: ({ direction, item }) => ({
      toastId: toast.loading(
        t(`history.notifications.${direction}.loading`, { entity: item.entityLabel }),
      ),
    }),
    onSuccess: async (_data, variables, context) => {
      toast.success(
        t(`history.notifications.${variables.direction}.success`, {
          entity: variables.item.entityLabel,
        }),
        { id: context?.toastId },
      );
      setPendingRecovery(null);
      await refreshHistory();
    },
    onError: (error: Error, variables, context) => {
      toast.error(
        error.message ||
          t(`history.notifications.${variables.direction}.error`, {
            entity: variables.item.entityLabel,
          }),
        { id: context?.toastId },
      );
      setPendingRecovery(null);
    },
  });

  function resetFilters() {
    setPage(1);
    setSearch('');
    setOperation('all');
    setResource('all');
    setState('all');
    setIncludeEcotrackSync(false);
    setSortDirection('desc');
  }

  function selectItem(item: HistoryListItem) {
    setSelectedId(item.id);
    if (!isWideLayout) setMobileInspectorOpen(true);
  }

  const inspector = (
    <HistoryInspector
      detail={detailQuery.data}
      loading={detailQuery.isFetching}
      error={detailQuery.error}
      onRetry={() => void detailQuery.refetch()}
      onRecover={(direction, item) => setPendingRecovery({ direction, item })}
    />
  );

  return {
    view: {
      className,
      t,
      historyQuery,
      search,
      setPage,
      setSearch,
      filtersOpen,
      activeFilterCount,
      setFiltersOpen,
      sortDirection,
      setSortDirection,
      operation,
      setOperation,
      resource,
      setResource,
      state,
      setState,
      includeEcotrackSync,
      setIncludeEcotrackSync,
      hasActiveFilters,
      resetFilters,
      groups,
      effectiveSelectedId,
      selectItem,
      locale,
      page,
      setMobileInspectorOpen,
      inspector,
      isWideLayout,
      mobileInspectorOpen,
      detailQuery,
      setPendingRecovery,
      pendingRecovery,
      recoveryMutation,
    } as const,
    fallback: null,
  };
}
