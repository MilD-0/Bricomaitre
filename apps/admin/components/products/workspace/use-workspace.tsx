'use client';

/* eslint-disable @next/next/no-img-element -- Operational catalog images include legacy external origins. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import { requestJson as request } from '../../../lib/admin-api';
import type { ExportJobResponse } from '../../../lib/background-job-contract';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
} from '../../../lib/meta-catalog-shared';
import { appendSortParams, toggleSortRule } from '../../../lib/multi-sort';
import type { PaginationMeta } from '../../../lib/pagination';
import {
  productListQuerySchema,
  type ProductPatch,
  type ProductRecord,
  type ProductSortKey,
  type ProductSortRule,
  type ProductStateFilter,
} from '../../../lib/products';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import { useStorefrontBaseUrl } from '../../storefront-origin';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Spinner } from '../../ui/spinner';
import { type ProductEditorState, type ProductsCatalogOptions } from '../product-editor-panel';
import { type MetaCatalogExportPreviewState } from '../product-export-presenters';

type ProductsResponse = { items: ProductRecord[]; pagination: PaginationMeta };
type ProductsMetaResponse = ProductsCatalogOptions;
type DeleteTarget = { ids: number[]; label: string };

export function formatMoney(locale: string, value: number | null | undefined) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatPercent(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDate(locale: string, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function ProductThumbnail({ product }: { product: ProductRecord }) {
  const image = product.images[0];
  return image ? (
    <img
      src={image}
      alt=""
      className="size-10 shrink-0 rounded-[var(--shape-radius-soft-sm)] object-cover"
    />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-[var(--shape-radius-soft-sm)] bg-muted text-muted-foreground">
      <PackageOpen className="size-4" aria-hidden="true" />
    </span>
  );
}

export function DeleteProductsDialog({
  target,
  open,
  pending,
  onConfirm,
  onOpenChange,
}: {
  target: string;
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('adminWorkspace.products.archiveDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('adminWorkspace.products.archiveDialogDescription', { target })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner className="size-4" /> : null}
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompactExportStatus({
  job,
  pendingCancel,
  onCancel,
  onDownload,
}: {
  job: NonNullable<ExportJobResponse['job']>;
  pendingCancel: boolean;
  onCancel: () => void;
  onDownload: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">
            {t(`products.exportAll.status.${job.status}`)} ·{' '}
            {t(`products.exportAll.progress.${job.progress.phase}`)}
          </span>
          <span className="shrink-0 tabular-nums">{job.progress.percentage}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${job.progress.percentage}%` }}
          />
        </div>
        {job.errorMessage ? (
          <p className="mt-1.5 text-xs text-destructive">{job.errorMessage}</p>
        ) : null}
      </div>
      {job.status === 'queued' || job.status === 'running' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendingCancel}
          onClick={onCancel}
        >
          {t(pendingCancel ? 'products.exportAll.cancelPending' : 'products.exportAll.cancel')}
        </Button>
      ) : null}
      {job.status === 'completed' && job.downloadPath ? (
        <Button type="button" size="sm" variant="outline" onClick={onDownload}>
          {t('products.exportAll.download')}
        </Button>
      ) : null}
    </div>
  );
}

export function useProductsWorkspace({
  initialData,
  initialMeta,
  canExportAll = false,
}: {
  initialData?: ProductsResponse;
  initialMeta?: ProductsMetaResponse;
  canExportAll?: boolean;
}) {
  const t = useTranslations();
  const storefrontBaseUrl = useStorefrontBaseUrl();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [filter, setFilter] = useState<ProductStateFilter>('all');
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortRules, setSortRules] = useState<ProductSortRule[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editorState, setEditorState] = useState<ProductEditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [metaCatalogExportState, setMetaCatalogExportState] =
    useState<MetaCatalogExportPreviewState>(null);
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      state: filter,
      brandId: selectedBrandId,
      categoryId: selectedCategoryId,
      sort: sortRules.map((rule) => `${rule.key}:${rule.direction}`).join(','),
    },
    selection: {
      entityType: 'product',
      ids: selectedIds,
      focusedId: editorState?.mode === 'edit' ? editorState.product.id : null,
    },
  });
  const productsQuery = useQuery({
    queryKey: [
      'products-workspace',
      page,
      deferredSearch,
      filter,
      selectedBrandId,
      selectedCategoryId,
      sortRules,
    ],
    queryFn: () => {
      const params = productListQuerySchema.parse({
        page,
        limit: 50,
        search: deferredSearch,
        state: filter,
        brandId: selectedBrandId,
        categoryId: selectedCategoryId,
        sort: sortRules.map((rule) => `${rule.key}:${rule.direction}`),
      });
      const searchParams = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
        search: params.search,
        state: params.state,
      });
      if (params.brandId !== null) searchParams.set('brandId', String(params.brandId));
      if (params.categoryId !== null) {
        searchParams.set('categoryId', String(params.categoryId));
      }
      appendSortParams(searchParams, params.sortRules);
      return request<ProductsResponse>(`/api/products?${searchParams.toString()}`);
    },
    initialData:
      page === 1 &&
      deferredSearch === '' &&
      filter === 'all' &&
      selectedBrandId === null &&
      selectedCategoryId === null &&
      sortRules.length === 0
        ? initialData
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const metaQuery = useQuery({
    queryKey: ['products-meta-workspace'],
    queryFn: () => request<ProductsMetaResponse>('/api/products/meta'),
    initialData: initialMeta,
    staleTime: 300_000,
  });
  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data?.items]);
  const visibleProducts = products;
  const pagination = productsQuery.data?.pagination;
  const activeFilterCount =
    Number(filter !== 'all') +
    Number(selectedBrandId !== null) +
    Number(selectedCategoryId !== null);

  const toggleSort = (key: ProductSortKey) => {
    setPage(1);
    setSortRules((current) => toggleSortRule(current, key, 'asc'));
  };

  const patchMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: ProductPatch }) =>
      request<{ ok: true }>(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      toast.success(t('adminWorkspace.products.quickChangeSaved'));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const patchSelectedMutation = useMutation({
    mutationFn: async (values: ProductPatch) => {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(
        ids.map((id) =>
          request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
        ),
      );
      return {
        succeeded: ids.filter((_, index) => results[index].status === 'fulfilled'),
        failed: ids.filter((_, index) => results[index].status === 'rejected'),
      };
    },
    onSuccess: async ({ succeeded, failed }) => {
      setSelectedIds((current) => current.filter((id) => !succeeded.includes(id)));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
      if (failed.length) {
        toast.error(
          t('adminWorkspace.products.bulkChangePartial', {
            saved: succeeded.length,
            failed: failed.length,
          }),
        );
      } else {
        toast.success(t('adminWorkspace.products.bulkChangeSaved', { count: succeeded.length }));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteProductsMutation = useMutation({
    mutationFn: async ({ ids }: DeleteTarget) => {
      const results = await Promise.allSettled(
        ids.map((id) => request(`/api/products/${id}`, { method: 'DELETE' })),
      );
      return {
        succeeded: ids.filter((_, index) => results[index].status === 'fulfilled'),
        failed: ids.filter((_, index) => results[index].status === 'rejected'),
      };
    },
    onSuccess: async ({ succeeded, failed }, target) => {
      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => !succeeded.includes(id)));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
      if (failed.length) {
        toast.error(
          t('adminWorkspace.products.bulkArchivePartial', {
            saved: succeeded.length,
            failed: failed.length,
          }),
        );
      } else {
        toast.success(t('adminWorkspace.products.archiveSuccess', { target: target.label }));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportJobQuery = useQuery({
    queryKey: ['products-export-all-job'],
    queryFn: () => request<ExportJobResponse>('/api/products/export-all'),
    enabled: canExportAll,
    initialData: { job: null },
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.job?.status === 'queued' || query.state.data?.job?.status === 'running'
        ? 1_000
        : false,
  });
  const exportInProgress =
    exportJobQuery.data.job?.status === 'queued' || exportJobQuery.data.job?.status === 'running';
  const startExportAllMutation = useMutation({
    mutationFn: () => request<ExportJobResponse>('/api/products/export-all', { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('products.exportAll.notifications.start.success'));
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelExportAllMutation = useMutation({
    mutationFn: () => request<ExportJobResponse>('/api/products/export-all', { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('products.exportAll.notifications.cancel.success'));
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedProducts = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    const byId = new Map<number, ProductRecord>();

    queryClient
      .getQueriesData<ProductsResponse>({ queryKey: ['products-workspace'] })
      .forEach(([, data]) => {
        data?.items.forEach((product) => {
          if (selectedIdSet.has(product.id)) byId.set(product.id, product);
        });
      });

    return selectedIds
      .map((id) => byId.get(id))
      .filter((product): product is ProductRecord => product !== undefined);
  }, [queryClient, selectedIds]);
  const brandNameById = useMemo(
    () => new Map((metaQuery.data?.brands ?? []).map((brand) => [brand.id, brand.name])),
    [metaQuery.data?.brands],
  );

  async function copySelectedProductIds() {
    try {
      await navigator.clipboard.writeText(selectedIds.join(','));
      toast.success(t('products.copy.success', { count: selectedIds.length }));
    } catch {
      toast.error(t('products.copy.error', { count: selectedIds.length }));
    }
  }

  function openMetaCatalogExportPreview() {
    if (selectedProducts.length === 0) return;
    setMetaCatalogExportState({
      title: t('products.export.title', { count: selectedProducts.length }),
      fileName: buildMetaCatalogExportFileName(),
      rows: buildMetaCatalogExportRows(selectedProducts, brandNameById, storefrontBaseUrl),
    });
  }

  function confirmMetaCatalogExport() {
    if (!metaCatalogExportState || selectedIds.length === 0) return;
    const searchParams = new URLSearchParams();
    selectedIds.forEach((id) => searchParams.append('ids', String(id)));
    window.open(`/api/products/meta-export?${searchParams.toString()}`, '_self');
    setMetaCatalogExportState(null);
  }

  return {
    view: {
      t,
      pagination,
      locale,
      canExportAll,
      startExportAllMutation,
      exportInProgress,
      setEditorState,
      search,
      setSearch,
      setPage,
      mobileFiltersOpen,
      activeFilterCount,
      setMobileFiltersOpen,
      filter,
      setFilter,
      selectedBrandId,
      setSelectedBrandId,
      metaQuery,
      selectedCategoryId,
      setSelectedCategoryId,
      selectedIds,
      patchSelectedMutation,
      copySelectedProductIds,
      selectedProducts,
      openMetaCatalogExportPreview,
      setDeleteTarget,
      setSelectedIds,
      exportJobQuery,
      cancelExportAllMutation,
      productsQuery,
      visibleProducts,
      storefrontBaseUrl,
      sortRules,
      toggleSort,
      patchMutation,
      editorState,
      queryClient,
      deleteTarget,
      deleteProductsMutation,
      metaCatalogExportState,
      setMetaCatalogExportState,
      confirmMetaCatalogExport,
    } as const,
    fallback: null,
  };
}
