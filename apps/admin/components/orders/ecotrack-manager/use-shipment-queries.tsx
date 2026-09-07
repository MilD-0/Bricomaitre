'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useState, useTransition } from 'react';
import { requestJson } from '../../../lib/admin-api';
import type {
  EcotrackCatalogResponse,
  EcotrackShipmentsResponse,
} from '../../../lib/ecotrack-admin-contracts';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import {
  type DeleteDialogState,
  type DispatchDialogState,
  type EditDialogState,
  type MajDialogState,
} from '../orders-ecotrack-dialogs';
import { type OrdersEcotrackManagerProps, type SortDirection, type SortKey } from './contract';
export function useShipmentQueries({ initialOrders, initialCatalog }: OrdersEcotrackManagerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(initialOrders?.pagination.page ?? 1);
  const [search, setSearch] = useState('');
  const [scanQuery, setScanQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [isFinalizeSubmitting, setIsFinalizeSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [dispatchDialog, setDispatchDialog] = useState<DispatchDialogState | null>(null);
  const [majDialog, setMajDialog] = useState<MajDialogState | null>(null);
  const [isFilterPending, startFilterTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredStaleOnly = useDeferredValue(staleOnly);
  const [initialOrdersUpdatedAt] = useState(() => (initialOrders ? Date.now() : 0));
  const [initialCatalogUpdatedAt] = useState(() => (initialCatalog ? Date.now() : 0));
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      status: deferredStatusFilter,
      staleOnly: deferredStaleOnly,
      sortKey,
      sortDirection,
    },
    selection: {
      entityType: 'order',
      ids: selectedIds,
      focusedId: editDialog?.orderId ?? expandedIds.at(-1) ?? null,
    },
  });

  const shipmentsQuery = useQuery({
    queryKey: [
      'ecotrack-shipments',
      page,
      deferredSearch,
      deferredStatusFilter,
      deferredStaleOnly,
      sortKey,
      sortDirection,
    ],
    queryFn: ({ signal }) =>
      requestJson<EcotrackShipmentsResponse>(
        `/api/orders/ecotrack/shipments?page=${page}&limit=25&search=${encodeURIComponent(deferredSearch)}&status=${encodeURIComponent(deferredStatusFilter)}&staleOnly=${deferredStaleOnly ? 'true' : 'false'}&sortKey=${sortKey}&sortDirection=${sortDirection}`,
        { signal },
      ),
    initialData:
      page === (initialOrders?.pagination.page ?? 1) &&
      deferredSearch === '' &&
      deferredStatusFilter === 'all' &&
      !deferredStaleOnly &&
      sortKey === 'createdAt' &&
      sortDirection === 'desc'
        ? initialOrders
        : undefined,
    initialDataUpdatedAt: initialOrdersUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const catalogQuery = useQuery({
    queryKey: ['ecotrack-catalog'],
    queryFn: () => requestJson<EcotrackCatalogResponse>('/api/ecotrack/catalog'),
    initialData: initialCatalog,
    initialDataUpdatedAt: initialCatalogUpdatedAt,
    staleTime: 300_000,
  });
  return {
    setEditDialog,
    setScanQuery,
    setDeleteDialog,
    setSelectedIds,
    setExpandedIds,
    setDispatchDialog,
    setMajDialog,
    shipmentsQuery,
    selectedIds,
    queryClient,
    page,
    setPage,
    editDialog,
    t,
    setIsFinalizeSubmitting,
    scanQuery,
    locale,
    isFilterPending,
    search,
    statusFilter,
    staleOnly,
    sortKey,
    sortDirection,
    expandedIds,
    startFilterTransition,
    setSearch,
    setStatusFilter,
    setStaleOnly,
    setSortKey,
    setSortDirection,
    catalogQuery,
    isFinalizeSubmitting,
    deleteDialog,
    dispatchDialog,
    majDialog,
  } as const;
}
