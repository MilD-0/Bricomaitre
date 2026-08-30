'use client';

/* eslint-disable @next/next/no-img-element -- Operational catalog images include legacy external origins. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
} from '../../lib/meta-catalog-shared';
import { appendSortParams, getSortRuleState, toggleSortRule } from '../../lib/multi-sort';
import type { PaginationMeta } from '../../lib/pagination';
import { canExportAllProducts } from '../../lib/permissions';
import {
  productListQuerySchema,
  type ProductPatch,
  type ProductRecord,
  type ProductSortKey,
  type ProductSortRule,
  type ProductStateFilter,
} from '../../lib/products';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/app-store';
import { MultiSortHeader } from '../multi-sort-header';
import { SearchField } from '../search-field';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import {
  MetaCatalogExportDialog,
  type MetaCatalogExportPreviewState,
  type ProductExportJobResponse,
} from './product-export-presenters';
import {
  ProductEditorPanel,
  type ProductEditorState,
  type ProductsCatalogOptions,
} from './product-editor-panel';
import { buildStorefrontProductHref } from './storefront-links';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
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

type ProductsResponse = { items: ProductRecord[]; pagination: PaginationMeta };
type ProductsMetaResponse = ProductsCatalogOptions;
type DeleteTarget = { ids: number[]; label: string };

function formatMoney(locale: string, value: number | null | undefined) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatPercent(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDate(locale: string, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function ProductThumbnail({ product }: { product: ProductRecord }) {
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

function DeleteProductsDialog({
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

function CompactExportStatus({
  job,
  pendingCancel,
  onCancel,
  onDownload,
}: {
  job: NonNullable<ProductExportJobResponse['job']>;
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
      {job.status === 'running' ? (
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

export function ProductsWorkspace({
  initialData,
  initialMeta,
}: {
  initialData?: ProductsResponse;
  initialMeta?: ProductsMetaResponse;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const role = useAppStore((state) => state.role);
  const canExportEntireCatalog = canExportAllProducts(role);
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
      await Promise.all(
        selectedIds.map((id) =>
          request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
        ),
      );
    },
    onSuccess: async () => {
      toast.success(t('adminWorkspace.products.bulkChangeSaved', { count: selectedIds.length }));
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteProductsMutation = useMutation({
    mutationFn: async ({ ids }: DeleteTarget) => {
      await Promise.all(ids.map((id) => request(`/api/products/${id}`, { method: 'DELETE' })));
    },
    onSuccess: async (_data, target) => {
      toast.success(
        t('notifications.products.archive.success', {
          target: target.label,
        }),
      );
      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => !target.ids.includes(id)));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportJobQuery = useQuery({
    queryKey: ['products-export-all-job'],
    queryFn: () => request<ProductExportJobResponse>('/api/products/export-all'),
    enabled: canExportEntireCatalog,
    initialData: { job: null },
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.job?.status === 'running' ? 1_000 : false),
  });
  const startExportAllMutation = useMutation({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('products.exportAll.notifications.start.success'));
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelExportAllMutation = useMutation({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'DELETE' }),
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
      rows: buildMetaCatalogExportRows(
        selectedProducts,
        brandNameById,
        new Map(selectedProducts.map((product) => [product.id, product.images[0] ?? ''])),
      ),
    });
  }

  function confirmMetaCatalogExport() {
    if (!metaCatalogExportState || selectedIds.length === 0) return;
    const searchParams = new URLSearchParams();
    selectedIds.forEach((id) => searchParams.append('ids', String(id)));
    window.open(`/api/products/meta-export?${searchParams.toString()}`, '_self');
    setMetaCatalogExportState(null);
  }

  return (
    <>
      <WorkspaceFrame data-admin-workspace="products">
        <WorkspaceHeader>
          <WorkspaceHeading
            title={t('nav.products')}
            meta={
              pagination ? (
                t('adminWorkspace.products.resultCount', { count: pagination.totalItems })
              ) : (
                <span
                  role="status"
                  className="inline-block h-4 w-20 animate-pulse rounded bg-muted"
                >
                  <span className="sr-only">{t('labels.loading')}</span>
                </span>
              )
            }
          />
          <WorkspaceActions>
            {canExportEntireCatalog ? (
              <CompactMenu label={t('labels.actions')}>
                <CompactMenuItem
                  disabled={
                    startExportAllMutation.isPending ||
                    exportJobQuery.data.job?.status === 'running'
                  }
                  onClick={() => startExportAllMutation.mutate()}
                >
                  {t(
                    exportJobQuery.data.job?.status === 'running'
                      ? 'products.exportAll.runningAction'
                      : 'products.exportAll.action',
                  )}
                </CompactMenuItem>
              </CompactMenu>
            ) : null}
            <Button type="button" onClick={() => setEditorState({ mode: 'create', product: null })}>
              <Plus className="size-4" aria-hidden="true" />
              {t('actions.createProduct')}
            </Button>
          </WorkspaceActions>
        </WorkspaceHeader>
        <WorkspaceToolbar>
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              label={t('adminWorkspace.common.search')}
              placeholder={t('adminWorkspace.products.searchPlaceholder')}
              className="flex-1 sm:min-w-[16rem]"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
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
          </div>
          <div
            className={cn(
              'mt-2 gap-2 sm:grid sm:grid-cols-3 lg:max-w-3xl',
              mobileFiltersOpen ? 'grid' : 'hidden',
            )}
          >
            <NativeSelect
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as ProductStateFilter);
                setPage(1);
              }}
              aria-label={t('adminWorkspace.common.filters')}
            >
              <NativeSelectOption value="all">
                {t('adminWorkspace.products.allStates')}
              </NativeSelectOption>
              <NativeSelectOption value="active">
                {t('adminWorkspace.products.active')}
              </NativeSelectOption>
              <NativeSelectOption value="inactive">
                {t('adminWorkspace.products.inactive')}
              </NativeSelectOption>
              <NativeSelectOption value="out">
                {t('adminWorkspace.products.outOfStock')}
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              value={selectedBrandId ?? ''}
              aria-label={t('labels.filterByBrand')}
              onChange={(event) => {
                setSelectedBrandId(event.target.value === '' ? null : Number(event.target.value));
                setPage(1);
              }}
            >
              <NativeSelectOption value="">{t('labels.allBrands')}</NativeSelectOption>
              {(metaQuery.data?.brands ?? []).map((brand) => (
                <NativeSelectOption key={brand.id} value={brand.id}>
                  {brand.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              value={selectedCategoryId ?? ''}
              aria-label={t('labels.filterByCategory')}
              onChange={(event) => {
                setSelectedCategoryId(
                  event.target.value === '' ? null : Number(event.target.value),
                );
                setPage(1);
              }}
            >
              <NativeSelectOption value="">{t('labels.allCategories')}</NativeSelectOption>
              {(metaQuery.data?.categories ?? []).map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </WorkspaceToolbar>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/[0.045] px-3 py-2">
            <span className="me-auto text-sm font-semibold">
              {t('adminWorkspace.common.selected', { count: selectedIds.length })}
            </span>
            <CompactMenu label={t('labels.actions')}>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: true })}
              >
                {t('actions.activateSelected')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: false })}
              >
                {t('actions.deactivateSelected')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: true })}
              >
                {t('actions.markInStock')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: false })}
              >
                {t('actions.markOutOfStock')}
              </CompactMenuItem>
              <div className="my-1 border-t border-border/60" />
              <CompactMenuItem onClick={() => void copySelectedProductIds()}>
                {t('products.copy.action')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={selectedProducts.length === 0}
                onClick={openMetaCatalogExportPreview}
              >
                {t('products.export.action')}
              </CompactMenuItem>
              <div className="my-1 border-t border-border/60" />
              <CompactMenuItem
                destructive
                onClick={() =>
                  setDeleteTarget({
                    ids: [...selectedIds],
                    label: t('labels.bulkSelectionCount', { count: selectedIds.length }),
                  })
                }
              >
                {t('adminWorkspace.products.archiveSelected')}
              </CompactMenuItem>
            </CompactMenu>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-9 px-0"
              aria-label={t('actions.cancel')}
              onClick={() => setSelectedIds([])}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {canExportEntireCatalog && exportJobQuery.data.job ? (
          <CompactExportStatus
            job={exportJobQuery.data.job}
            pendingCancel={cancelExportAllMutation.isPending}
            onCancel={() => cancelExportAllMutation.mutate()}
            onDownload={() => {
              const path = exportJobQuery.data.job?.downloadPath;
              if (path) window.open(path, '_self');
            }}
          />
        ) : null}

        {productsQuery.isError ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            {productsQuery.error.message}
          </p>
        ) : null}

        <div className="divide-y divide-border/55 lg:hidden">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3.5"
            >
              <Checkbox
                aria-label={t('labels.selectRow', { name: product.title })}
                checked={selectedIds.includes(product.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, product.id])]
                      : current.filter((id) => id !== product.id),
                  )
                }
              />
              <div className="flex min-w-0 items-center gap-3 text-start">
                <ProductThumbnail product={product} />
                <span className="min-w-0">
                  <a
                    href={buildStorefrontProductHref(product)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                  >
                    {product.title}
                  </a>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {product.sku || t('adminWorkspace.products.noSku')} ·{' '}
                    {formatMoney(locale, product.price)}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={product.active ? 'text-emerald-700' : 'text-muted-foreground'}>
                      {product.active ? t('labels.active') : t('labels.inactive')}
                    </span>
                    <span className={product.inStock ? 'text-foreground' : 'text-amber-700'}>
                      {product.inStock
                        ? t('labels.inStock')
                        : t('adminWorkspace.products.outOfStock')}
                    </span>
                  </span>
                </span>
              </div>
              <CompactMenu label={`${t('labels.actions')} · ${product.title}`}>
                <CompactMenuItem onClick={() => setEditorState({ mode: 'edit', product })}>
                  {t('actions.edit')}
                </CompactMenuItem>
                <CompactMenuItem
                  destructive
                  onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                >
                  {t('adminWorkspace.products.archive')}
                </CompactMenuItem>
              </CompactMenu>
            </div>
          ))}
        </div>

        <div
          className="hidden overflow-x-auto outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-inset focus-visible:ring-ring/30 lg:block"
          role="region"
          aria-label={t('nav.products')}
          tabIndex={0}
        >
          <table className="w-full min-w-[1160px] border-collapse text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="w-12 px-3 py-3 text-start">
                  <Checkbox
                    aria-label={t('labels.selectAll')}
                    checked={
                      visibleProducts.length > 0 &&
                      visibleProducts.every((product) => selectedIds.includes(product.id))
                    }
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked ? visibleProducts.map((item) => item.id) : [],
                      )
                    }
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('adminWorkspace.products.product')}
                    sortState={getSortRuleState(sortRules, 'title')}
                    onClick={() => toggleSort('title')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.price')}
                    sortState={getSortRuleState(sortRules, 'price')}
                    onClick={() => toggleSort('price')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.purchasePrice')}
                    sortState={getSortRuleState(sortRules, 'purchasePrice')}
                    onClick={() => toggleSort('purchasePrice')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">{t('labels.purchases')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('labels.confirmationRate')}</th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.active')}
                    sortState={getSortRuleState(sortRules, 'active')}
                    onClick={() => toggleSort('active')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.inStock')}
                    sortState={getSortRuleState(sortRules, 'inStock')}
                    onClick={() => toggleSort('inStock')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.modified')}
                    sortState={getSortRuleState(sortRules, 'updatedAt')}
                    onClick={() => toggleSort('updatedAt')}
                  />
                </th>
                <th className="sticky end-0 z-10 w-12 bg-muted px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product, index) => (
                <tr
                  key={product.id}
                  className={cn(
                    'border-b border-border/50 transition-colors hover:bg-primary/[0.035]',
                    index % 2 === 1 && 'bg-muted/[0.14]',
                  )}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      aria-label={t('labels.selectRow', { name: product.title })}
                      checked={selectedIds.includes(product.id)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, product.id])]
                            : current.filter((id) => id !== product.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[26rem] items-center gap-3 text-start">
                      <ProductThumbnail product={product} />
                      <span className="min-w-0">
                        <a
                          href={buildStorefrontProductHref(product)}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                        >
                          {product.title}
                        </a>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {product.sku || t('adminWorkspace.products.noSku')}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium tabular-nums">
                    {formatMoney(locale, product.price)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">
                    {formatMoney(locale, product.purchasePrice)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{product.orderPurchaseCount}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatPercent(locale, product.confirmationRate)}
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={product.active}
                      aria-label={`${t('labels.active')} · ${product.title}`}
                      disabled={patchMutation.isPending}
                      onCheckedChange={(active) =>
                        patchMutation.mutate({ id: product.id, values: { active } })
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={product.inStock}
                      aria-label={`${t('labels.inStock')} · ${product.title}`}
                      disabled={patchMutation.isPending}
                      onCheckedChange={(inStock) =>
                        patchMutation.mutate({ id: product.id, values: { inStock } })
                      }
                    />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDate(locale, product.updatedAt)}
                  </td>
                  <td className="sticky end-0 z-10 bg-background px-3 py-3 shadow-[var(--elevation-sticky-end)] rtl:shadow-[var(--elevation-sticky-start)]">
                    <CompactMenu
                      label={`${t('labels.actions')} · ${product.title}`}
                      side={index >= visibleProducts.length - 2 ? 'top' : 'bottom'}
                    >
                      <CompactMenuItem onClick={() => setEditorState({ mode: 'edit', product })}>
                        {t('actions.edit')}
                      </CompactMenuItem>
                      <CompactMenuItem
                        destructive
                        onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                      >
                        {t('adminWorkspace.products.archive')}
                      </CompactMenuItem>
                    </CompactMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {productsQuery.isFetching ? (
          <div className="flex items-center justify-center gap-2 border-t border-border/50 px-4 py-4 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {t('labels.loading')}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="grid min-h-56 place-items-center border-t border-border/50 text-sm text-muted-foreground">
            {t('adminWorkspace.common.noResults')}
          </div>
        ) : null}

        {pagination ? (
          <WorkspacePagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            pending={productsQuery.isFetching}
            onPageChange={setPage}
          />
        ) : null}
      </WorkspaceFrame>

      <ProductEditorPanel
        state={editorState}
        meta={metaQuery.data ?? { brands: [], categories: [] }}
        onClose={() => setEditorState(null)}
        onChanged={async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['products-workspace'] }),
            queryClient.invalidateQueries({ queryKey: ['products-workspace-editor'] }),
          ]);
        }}
      />
      <DeleteProductsDialog
        target={deleteTarget?.label ?? ''}
        open={deleteTarget !== null}
        pending={deleteProductsMutation.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteProductsMutation.mutate(deleteTarget)}
      />
      <MetaCatalogExportDialog
        state={metaCatalogExportState}
        onOpenChange={(open) => {
          if (!open) setMetaCatalogExportState(null);
        }}
        onConfirm={confirmMetaCatalogExport}
      />
    </>
  );
}
