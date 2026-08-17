'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails can come from legacy arbitrary origins and are not page-critical media. */

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
} from '../lib/meta-catalog-shared';
import { requestJson as request } from '../lib/admin-api';
import {
  readClientStorage as readStorage,
  writeClientStorage as writeStorage,
} from '../lib/client-storage';
import { captureQueries, restoreQueries, type QuerySnapshot } from '../lib/query-cache';
import { canExportAllProducts } from '../lib/permissions';
import { cn } from '../lib/utils';
import {
  imageOriginFilterValues,
  productListQuerySchema,
  productPayloadSchema,
  type ProductPatch,
  type ProductPayload,
  type ProductPayloadInput,
  type ProductRecord,
  type ProductSortKey,
  type ProductSortRule,
} from '../lib/products';
import { appendSortParams, getSortRuleState, toggleSortRule } from '../lib/multi-sort';
import type { PaginationMeta } from '../lib/pagination';
import { toast } from '../lib/toast';
import { useAppStore } from '../store/app-store';
import { MultiSortHeader } from './multi-sort-header';
import { SearchField } from './search-field';
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
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from './ui/motion';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Separator } from './ui/separator';
import { Spinner } from './ui/spinner';
import { Switch } from './ui/switch';
import { TablePaginationControls } from './table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ViewModeToggle, type ViewMode } from './view-mode-toggle';
import type { BrandOption, CategoryOption } from './products/product-editor-dialog';
import {
  MetaCatalogExportDialog,
  ProductExportStatusCard,
  type MetaCatalogExportPreviewState,
  type ProductExportJobResponse,
} from './products/product-export-presenters';
import { buildStorefrontProductHref } from './products/storefront-links';

const ProductDialogForm = dynamic(() =>
  import('./products/product-editor-dialog').then((module) => module.ProductDialogForm),
);

type ProductsResponse = { items: ProductRecord[]; pagination: PaginationMeta };
type ProductDetailResponse = { item: ProductRecord };
type ProductsMetaResponse = { brands: BrandOption[]; categories: CategoryOption[] };
type MutationMessages = { loading: string; success: string; error: string };
type ProductDialogState = { open: boolean; mode: 'create' | 'edit'; editingId: number | null };
type ProductUpdateMutationVariables = {
  id: number;
  values: ProductPayload;
  messages: MutationMessages;
};
type ProductCreateMutationVariables = { values: ProductPayload; messages: MutationMessages };
type ProductPatchMutationVariables = {
  id: number;
  values: ProductPatch;
  messages: MutationMessages;
};
type ProductBulkPatchMutationVariables = {
  ids: number[];
  values: ProductPatch;
  messages: MutationMessages;
};
type ProductDeleteMutationVariables = { ids: number[]; messages: MutationMessages };
type MutationContext<T> = {
  messages: MutationMessages;
  snapshot: QuerySnapshot<T>;
  toastId: string;
};
type ImageOriginFilter = (typeof imageOriginFilterValues)[number];

const PRODUCT_DIALOG_STORAGE_KEY = 'products-dialog-state-v2';
const PRODUCTS_VIEW_MODE_STORAGE_KEY = 'products-view-mode-v1';
const defaults: ProductPayloadInput = {
  title: '',
  titleAr: null,
  description: null,
  descriptionAr: null,
  sku: null,
  barcode: null,
  price: 0,
  oldPrice: null,
  purchasePrice: null,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 0,
  brandId: null,
  categoryId: null,
  images: [],
  promoCodes: [],
};

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
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

function updateProductLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (product: ProductRecord) => ProductRecord | null,
) {
  queryClient.setQueriesData<ProductsResponse>({ queryKey: ['products-table'] }, (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map(updater).filter((item): item is ProductRecord => item !== null),
    };
  });
}

export function ProductsManager({
  initialCanExportAll = false,
}: {
  initialCanExportAll?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const role = useAppStore((state) => state.role);
  const canExportEntireCatalog = initialCanExportAll || canExportAllProducts(role);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedImageOrigin, setSelectedImageOrigin] = useState<ImageOriginFilter>('all');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [sortRules, setSortRules] = useState<ProductSortRule[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [metaCatalogExportState, setMetaCatalogExportState] =
    useState<MetaCatalogExportPreviewState>(null);
  const [deleteState, setDeleteState] = useState<{ ids: number[]; label: string } | null>(null);
  const [dialogState, setDialogState] = useState<ProductDialogState>({
    open: false,
    mode: 'create',
    editingId: null,
  });
  const [isFilterPending, startFilterTransition] = useTransition();
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const hydratedRef = useRef(false);
  const initializedExportStatusRef = useRef(false);
  const lastExportStatusKeyRef = useRef<string | null>(null);

  const form = useForm<ProductPayloadInput>({
    resolver: zodResolver(productPayloadSchema),
    defaultValues: defaults,
  });
  const draftValues = useWatch({ control: form.control });

  const productsQuery = useQuery({
    queryKey: [
      'products-table',
      page,
      deferredSearch,
      selectedBrandId,
      selectedCategoryId,
      selectedImageOrigin,
      sortRules,
    ],
    queryFn: () => {
      const params = productListQuerySchema.parse({
        page,
        limit: 50,
        search: deferredSearch,
        brandId: selectedBrandId,
        categoryId: selectedCategoryId,
        imageOrigin: selectedImageOrigin,
        sort: sortRules.map((rule) => `${rule.key}:${rule.direction}`),
      });
      const searchParams = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
        search: params.search,
      });
      appendSortParams(searchParams, params.sortRules);
      if (params.brandId !== null) {
        searchParams.set('brandId', String(params.brandId));
      }
      if (params.categoryId !== null) {
        searchParams.set('categoryId', String(params.categoryId));
      }
      if (params.imageOrigin !== 'all') {
        searchParams.set('imageOrigin', params.imageOrigin);
      }
      return request<ProductsResponse>(`/api/products?${searchParams.toString()}`);
    },
    initialData: {
      items: [],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const metaQuery = useQuery({
    queryKey: ['products-meta'],
    queryFn: () => request<ProductsMetaResponse>('/api/products/meta'),
    initialData: { brands: [], categories: [] },
    initialDataUpdatedAt: 0,
    staleTime: 300_000,
  });

  const exportJobQuery = useQuery({
    queryKey: ['products-export-all-job'],
    queryFn: () => request<ProductExportJobResponse>('/api/products/export-all'),
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
    enabled: canExportEntireCatalog,
  });

  useEffect(() => {
    const stored = readStorage<{ dialogState: ProductDialogState; values: ProductPayloadInput }>(
      PRODUCT_DIALOG_STORAGE_KEY,
    );
    if (stored) {
      queueMicrotask(() => setDialogState(stored.dialogState));
      form.reset(stored.values);
    }
    hydratedRef.current = true;
  }, [form]);

  useEffect(() => {
    const stored = readStorage<ViewMode>(PRODUCTS_VIEW_MODE_STORAGE_KEY);
    if (stored === 'cards' || stored === 'table') {
      queueMicrotask(() => setViewMode(stored));
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (!dialogState.open) {
      writeStorage(PRODUCT_DIALOG_STORAGE_KEY, null);
      return;
    }

    writeStorage(PRODUCT_DIALOG_STORAGE_KEY, {
      dialogState,
      values: {
        title: draftValues.title ?? '',
        slug: draftValues.slug ?? null,
        titleAr: draftValues.titleAr ?? null,
        description: draftValues.description ?? null,
        descriptionAr: draftValues.descriptionAr ?? null,
        sku: draftValues.sku ?? null,
        barcode: draftValues.barcode ?? null,
        price: draftValues.price ?? 0,
        oldPrice: draftValues.oldPrice ?? null,
        purchasePrice: draftValues.purchasePrice ?? null,
        active: draftValues.active ?? true,
        inStock: draftValues.inStock ?? true,
        availabilityStatus: draftValues.availabilityStatus ?? 'in_stock',
        inventoryQuantity: draftValues.inventoryQuantity ?? 0,
        brandId: draftValues.brandId ?? null,
        categoryId: draftValues.categoryId ?? null,
        images: draftValues.images ?? [],
        promoCodes: draftValues.promoCodes ?? [],
      },
    });
  }, [dialogState, draftValues]);

  const openCreate = () => {
    form.reset(defaults);
    startFilterTransition(() => {
      setDialogState({ open: true, mode: 'create', editingId: null });
    });
  };

  const closeDialog = () => {
    setDialogState({ open: false, mode: 'create', editingId: null });
    form.reset(defaults);
    writeStorage(PRODUCT_DIALOG_STORAGE_KEY, null);
  };

  const partialUpdateMutation = useMutation<
    unknown,
    Error,
    ProductPatchMutationVariables,
    MutationContext<ProductsResponse>
  >({
    mutationFn: ({ id, values }) =>
      request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
    onMutate: async ({ id, values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['products-table'] });
      const snapshot = captureQueries<ProductsResponse>(queryClient, ['products-table']);
      const toastId = toast.loading(messages.loading);

      updateProductLists(queryClient, (product) =>
        product.id === id
          ? { ...product, ...values, updatedAt: new Date().toISOString() }
          : product,
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-table'] });
    },
  });

  const updateMutation = useMutation<
    unknown,
    Error,
    ProductUpdateMutationVariables,
    MutationContext<ProductsResponse>
  >({
    mutationFn: ({ id, values }) =>
      request(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(values) }),
    onMutate: async ({ id, values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['products-table'] });
      const snapshot = captureQueries<ProductsResponse>(queryClient, ['products-table']);
      const toastId = toast.loading(messages.loading);

      updateProductLists(queryClient, (product) =>
        product.id === id
          ? { ...product, ...values, updatedAt: new Date().toISOString() }
          : product,
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
      closeDialog();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-table'] });
    },
  });

  const createMutation = useMutation<
    unknown,
    Error,
    ProductCreateMutationVariables,
    MutationContext<ProductsResponse>
  >({
    mutationFn: ({ values }) =>
      request('/api/products', { method: 'POST', body: JSON.stringify(values) }),
    onMutate: async ({ messages }) => {
      await queryClient.cancelQueries({ queryKey: ['products-table'] });
      const snapshot = captureQueries<ProductsResponse>(queryClient, ['products-table']);
      const toastId = toast.loading(messages.loading);

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
      closeDialog();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-table'] });
    },
  });

  const bulkPatchMutation = useMutation<
    unknown,
    Error,
    ProductBulkPatchMutationVariables,
    MutationContext<ProductsResponse>
  >({
    mutationFn: ({ ids, values }) =>
      Promise.all(
        ids.map((id) =>
          request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
        ),
      ),
    onMutate: async ({ ids, values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['products-table'] });
      const snapshot = captureQueries<ProductsResponse>(queryClient, ['products-table']);
      const toastId = toast.loading(messages.loading);

      updateProductLists(queryClient, (product) =>
        ids.includes(product.id)
          ? { ...product, ...values, updatedAt: new Date().toISOString() }
          : product,
      );
      setSelectedIds([]);

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-table'] });
    },
  });

  const deleteMutation = useMutation<
    unknown,
    Error,
    ProductDeleteMutationVariables,
    MutationContext<ProductsResponse>
  >({
    mutationFn: ({ ids }) =>
      Promise.all(ids.map((id) => request(`/api/products/${id}`, { method: 'DELETE' }))),
    onMutate: async ({ ids, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['products-table'] });
      const snapshot = captureQueries<ProductsResponse>(queryClient, ['products-table']);
      const toastId = toast.loading(messages.loading);

      updateProductLists(queryClient, (product) => (ids.includes(product.id) ? null : product));
      setSelectedIds([]);
      setDeleteState(null);

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-table'] });
    },
  });

  const paginatedItems = productsQuery.data.items;
  const exportJob = exportJobQuery.data.job;
  const totalPages = productsQuery.data.pagination?.totalPages ?? 1;
  const allSelected =
    paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.includes(item.id));

  const startExportAllMutation = useMutation<
    ProductExportJobResponse,
    Error,
    void,
    { toastId: string }
  >({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'POST' }),
    onMutate: () => ({
      toastId: toast.loading(t('products.exportAll.notifications.start.loading')),
    }),
    onError: (error, _variables, context) => {
      toast.error(error.message || t('products.exportAll.notifications.start.error'), {
        id: context?.toastId,
      });
    },
    onSuccess: async (_data, _variables, context) => {
      toast.success(t('products.exportAll.notifications.start.success'), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
  });

  const cancelExportAllMutation = useMutation<
    ProductExportJobResponse,
    Error,
    void,
    { toastId: string }
  >({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'DELETE' }),
    onMutate: () => ({
      toastId: toast.loading(t('products.exportAll.notifications.cancel.loading')),
    }),
    onError: (error, _variables, context) => {
      toast.error(error.message || t('products.exportAll.notifications.cancel.error'), {
        id: context?.toastId,
      });
    },
    onSuccess: async (_data, _variables, context) => {
      toast.success(t('products.exportAll.notifications.cancel.success'), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
  });

  useEffect(() => {
    const currentPage = productsQuery.data.pagination?.page ?? 1;
    if (!productsQuery.isFetching && !productsQuery.isPlaceholderData && page !== currentPage) {
      queueMicrotask(() => setPage(currentPage));
    }
  }, [
    page,
    productsQuery.data.pagination?.page,
    productsQuery.isFetching,
    productsQuery.isPlaceholderData,
  ]);

  useEffect(() => {
    const statusKey = exportJob ? `${exportJob.id}:${exportJob.status}` : null;

    if (!initializedExportStatusRef.current) {
      initializedExportStatusRef.current = true;
      lastExportStatusKeyRef.current = statusKey;
      return;
    }

    if (!statusKey || statusKey === lastExportStatusKeyRef.current) {
      return;
    }

    lastExportStatusKeyRef.current = statusKey;

    if (exportJob?.status === 'completed') {
      toast.success(t('products.exportAll.notifications.status.completed'));
    } else if (exportJob?.status === 'cancelled') {
      toast.success(t('products.exportAll.notifications.status.cancelled'));
    } else if (exportJob?.status === 'failed') {
      toast.error(exportJob.errorMessage || t('products.exportAll.notifications.status.failed'));
    }
  }, [exportJob, t]);

  const toggleSort = (key: ProductSortKey) => {
    startFilterTransition(() => {
      setPage(1);
      setSortRules((current) => toggleSortRule(current, key, 'asc'));
    });
  };

  const formatCurrency = (value: number | null | undefined, maximumFractionDigits = 2) => {
    if (value == null) {
      return '—';
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'DZD',
      minimumFractionDigits: maximumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  };

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);
  const formatPercent = (value: number | null | undefined) => {
    if (value == null) {
      return '—';
    }

    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(value / 100);
  };
  const brandNameById = useMemo(
    () => new Map(metaQuery.data.brands.map((brand) => [brand.id, brand.name])),
    [metaQuery.data.brands],
  );
  const categoryNameById = useMemo(
    () => new Map(metaQuery.data.categories.map((category) => [category.id, category.name])),
    [metaQuery.data.categories],
  );
  const selectedProducts = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    const selectedProductById = new Map<number, ProductRecord>();

    queryClient
      .getQueriesData<ProductsResponse>({ queryKey: ['products-table'] })
      .forEach(([, data]) => {
        data?.items.forEach((item) => {
          if (selectedIdSet.has(item.id) && !selectedProductById.has(item.id)) {
            selectedProductById.set(item.id, item);
          }
        });
      });

    return selectedIds
      .map((id) => selectedProductById.get(id))
      .filter((product): product is ProductRecord => product !== undefined);
  }, [queryClient, selectedIds]);

  const openEdit = (product: ProductRecord) => {
    form.reset({
      ...product,
      promoCodes: product.promoCodes ?? [],
    });
    startFilterTransition(() => {
      setDialogState({ open: true, mode: 'edit', editingId: product.id });
    });

    void request<ProductDetailResponse>(`/api/products/${product.id}`)
      .then((detail) => {
        form.reset({
          ...detail.item,
          promoCodes: detail.item.promoCodes ?? [],
        });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t('products.promos.loadError'));
      });
  };

  const submitDialog = form.handleSubmit(async (rawValues) => {
    const values = productPayloadSchema.parse(rawValues);

    if (dialogState.mode === 'edit' && dialogState.editingId !== null) {
      await updateMutation.mutateAsync({
        id: dialogState.editingId,
        values,
        messages: buildMessages(
          t,
          'notifications.products.save.loading',
          'notifications.products.save.success',
          'notifications.products.save.error',
          { name: values.title },
        ),
      });
      return;
    }

    await createMutation.mutateAsync({
      values,
      messages: buildMessages(
        t,
        'notifications.products.create.loading',
        'notifications.products.create.success',
        'notifications.products.create.error',
        { name: values.title },
      ),
    });
  });

  function openMetaCatalogExportPreview() {
    if (selectedProducts.length === 0) {
      return;
    }

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
    if (!metaCatalogExportState || selectedIds.length === 0) {
      return;
    }

    const searchParams = new URLSearchParams();
    selectedIds.forEach((id) => {
      searchParams.append('ids', String(id));
    });

    window.open(`/api/products/meta-export?${searchParams.toString()}`, '_self');
    setMetaCatalogExportState(null);
  }

  async function copySelectedProductIds() {
    if (selectedIds.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedIds.join(','));
      toast.success(t('products.copy.success', { count: selectedIds.length }));
    } catch {
      toast.error(t('products.copy.error', { count: selectedIds.length }));
    }
  }

  function downloadExportJob() {
    if (!exportJob?.downloadPath) {
      return;
    }

    window.open(exportJob.downloadPath, '_self');
  }

  return (
    <motion.section
      id="products"
      className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      {...sectionTransitionProps}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.products')}</h2>
            <PendingInline
              active={isFilterPending || productsQuery.isFetching}
              label={t('labels.loading')}
              className="mt-2"
            />
          </div>
          <Button type="button" onClick={openCreate}>
            {isFilterPending && dialogState.mode === 'create' && dialogState.open ? (
              <Spinner data-icon="inline-start" className="size-3.5" />
            ) : null}
            {t('actions.createProduct')}
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
            <SearchField
              value={search}
              placeholder={t('labels.searchProducts')}
              onChange={(value) => {
                startFilterTransition(() => {
                  setPage(1);
                  setSearch(value);
                });
              }}
            />
            <ViewModeToggle
              value={viewMode}
              cardsLabel={t('products.view.cards')}
              tableLabel={t('products.view.table')}
              onChange={(nextViewMode) => {
                setViewMode(nextViewMode);
                writeStorage(PRODUCTS_VIEW_MODE_STORAGE_KEY, nextViewMode);
              }}
            />
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[42rem]">
              <NativeSelect
                aria-label={t('labels.filterByBrand')}
                value={selectedBrandId ?? ''}
                onChange={(event) => {
                  startFilterTransition(() => {
                    setPage(1);
                    setSelectedBrandId(
                      event.target.value === '' ? null : Number(event.target.value),
                    );
                  });
                }}
              >
                <NativeSelectOption value="">{t('labels.allBrands')}</NativeSelectOption>
                {metaQuery.data.brands.map((brand) => (
                  <NativeSelectOption key={brand.id} value={brand.id}>
                    {brand.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('labels.filterByCategory')}
                value={selectedCategoryId ?? ''}
                onChange={(event) => {
                  startFilterTransition(() => {
                    setPage(1);
                    setSelectedCategoryId(
                      event.target.value === '' ? null : Number(event.target.value),
                    );
                  });
                }}
              >
                <NativeSelectOption value="">{t('labels.allCategories')}</NativeSelectOption>
                {metaQuery.data.categories.map((category) => (
                  <NativeSelectOption key={category.id} value={category.id}>
                    {category.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('labels.filterByImageOrigin')}
                value={selectedImageOrigin}
                onChange={(event) => {
                  startFilterTransition(() => {
                    setPage(1);
                    setSelectedImageOrigin(event.target.value as ImageOriginFilter);
                  });
                }}
              >
                <NativeSelectOption value="all">{t('labels.allImageLinks')}</NativeSelectOption>
                <NativeSelectOption value="external">
                  {t('labels.externalImageLinks')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkPatchMutation.mutate({
                  ids: selectedIds,
                  values: { active: true },
                  messages: buildMessages(
                    t,
                    'notifications.products.activateSelected.loading',
                    'notifications.products.activateSelected.success',
                    'notifications.products.activateSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.activateSelected')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkPatchMutation.mutate({
                  ids: selectedIds,
                  values: { active: false },
                  messages: buildMessages(
                    t,
                    'notifications.products.deactivateSelected.loading',
                    'notifications.products.deactivateSelected.success',
                    'notifications.products.deactivateSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.deactivateSelected')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkPatchMutation.mutate({
                  ids: selectedIds,
                  values: { inStock: true },
                  messages: buildMessages(
                    t,
                    'notifications.products.stockSelected.loading',
                    'notifications.products.stockSelected.success',
                    'notifications.products.stockSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.markInStock')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkPatchMutation.mutate({
                  ids: selectedIds,
                  values: { inStock: false },
                  messages: buildMessages(
                    t,
                    'notifications.products.unstockSelected.loading',
                    'notifications.products.unstockSelected.success',
                    'notifications.products.unstockSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.markOutOfStock')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => void copySelectedProductIds()}
            >
              {t('products.copy.action')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={openMetaCatalogExportPreview}
            >
              {t('products.export.action')}
            </Button>
            {canExportEntireCatalog ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={startExportAllMutation.isPending || exportJob?.status === 'running'}
                onClick={() => startExportAllMutation.mutate()}
              >
                {t(
                  exportJob?.status === 'running'
                    ? 'products.exportAll.runningAction'
                    : 'products.exportAll.action',
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                setDeleteState({
                  ids: selectedIds,
                  label: t('labels.bulkSelectionCount', { count: selectedIds.length }),
                })
              }
            >
              {t('actions.deleteSelected')}
            </Button>
          </div>
        </div>
        {canExportEntireCatalog && exportJob ? (
          <ProductExportStatusCard
            job={exportJob}
            pendingCancel={cancelExportAllMutation.isPending}
            onCancel={() => cancelExportAllMutation.mutate()}
            onDownload={downloadExportJob}
          />
        ) : null}
      </div>

      <div className="relative" aria-busy={productsQuery.isFetching}>
        <div
          className={
            productsQuery.isFetching
              ? 'transition-opacity duration-200 opacity-70'
              : 'transition-opacity duration-200'
          }
        >
          <div
            className={cn('overflow-x-auto px-4 pb-4', viewMode === 'table' ? 'block' : 'hidden')}
            data-testid="products-table-view"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label={t('labels.selectAll')}
                      checked={allSelected}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? [
                                ...new Set([
                                  ...selectedIds,
                                  ...paginatedItems.map((item) => item.id),
                                ]),
                              ]
                            : selectedIds.filter(
                                (id) => !paginatedItems.some((item) => item.id === id),
                              ),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-28">
                    <MultiSortHeader
                      label={t('labels.active')}
                      sortState={getSortRuleState(sortRules, 'active')}
                      onClick={() => toggleSort('active')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.productName')}
                      sortState={getSortRuleState(sortRules, 'title')}
                      onClick={() => toggleSort('title')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.price')}
                      sortState={getSortRuleState(sortRules, 'price')}
                      onClick={() => toggleSort('price')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.purchasePrice')}
                      sortState={getSortRuleState(sortRules, 'purchasePrice')}
                      onClick={() => toggleSort('purchasePrice')}
                    />
                  </TableHead>
                  <TableHead>{t('labels.purchases')}</TableHead>
                  <TableHead>{t('labels.confirmationRate')}</TableHead>
                  <TableHead className="w-28">
                    <MultiSortHeader
                      label={t('labels.inStock')}
                      sortState={getSortRuleState(sortRules, 'inStock')}
                      onClick={() => toggleSort('inStock')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.modified')}
                      sortState={getSortRuleState(sortRules, 'updatedAt')}
                      onClick={() => toggleSort('updatedAt')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.created')}
                      sortState={getSortRuleState(sortRules, 'createdAt')}
                      onClick={() => toggleSort('createdAt')}
                    />
                  </TableHead>
                  <TableHead className="w-48 text-right">{t('labels.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((product) => {
                  const previewVisible =
                    hoveredProductId === product.id && Boolean(product.images[0]);
                  const storefrontHref = buildStorefrontProductHref(product);

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={t('labels.selectRow', { name: product.title })}
                          checked={selectedIds.includes(product.id)}
                          onChange={(event) =>
                            setSelectedIds((value) =>
                              event.target.checked
                                ? [...new Set([...value, product.id])]
                                : value.filter((id) => id !== product.id),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={product.active}
                          aria-label={t('labels.active')}
                          onCheckedChange={(checked) =>
                            partialUpdateMutation.mutate({
                              id: product.id,
                              values: { active: checked },
                              messages: buildMessages(
                                t,
                                checked
                                  ? 'notifications.products.activate.loading'
                                  : 'notifications.products.deactivate.loading',
                                checked
                                  ? 'notifications.products.activate.success'
                                  : 'notifications.products.deactivate.success',
                                checked
                                  ? 'notifications.products.activate.error'
                                  : 'notifications.products.deactivate.error',
                                { name: product.title },
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          className="relative inline-flex"
                          onMouseEnter={() => setHoveredProductId(product.id)}
                          onMouseLeave={() =>
                            setHoveredProductId((current) =>
                              current === product.id ? null : current,
                            )
                          }
                        >
                          <a
                            href={storefrontHref}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {product.title}
                          </a>
                          {previewVisible ? (
                            <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-lg">
                              <img
                                src={product.images[0]}
                                alt={product.title}
                                className="aspect-square w-full object-cover"
                              />
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(product.price, 0)}</TableCell>
                      <TableCell>{formatCurrency(product.purchasePrice)}</TableCell>
                      <TableCell>{product.orderPurchaseCount}</TableCell>
                      <TableCell>{formatPercent(product.confirmationRate)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={product.inStock}
                          aria-label={t('labels.inStock')}
                          onCheckedChange={(checked) =>
                            partialUpdateMutation.mutate({
                              id: product.id,
                              values: { inStock: checked },
                              messages: buildMessages(
                                t,
                                checked
                                  ? 'notifications.products.stock.loading'
                                  : 'notifications.products.unstock.loading',
                                checked
                                  ? 'notifications.products.stock.success'
                                  : 'notifications.products.unstock.success',
                                checked
                                  ? 'notifications.products.stock.error'
                                  : 'notifications.products.unstock.error',
                                { name: product.title },
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(product.updatedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(product.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openEdit(product)}
                          >
                            {t('actions.modify')}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setDeleteState({ ids: [product.id], label: product.title })
                            }
                          >
                            {t('actions.delete')}
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
            className={cn('grid gap-3 px-4 pb-4', viewMode === 'cards' ? 'grid' : 'hidden')}
            data-testid="products-card-view"
          >
            {paginatedItems.map((product) => (
              <Card
                key={product.id}
                className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card p-0 shadow-sm"
              >
                <div className="relative aspect-[4/3] overflow-hidden border-b border-border/60 bg-muted/60">
                  {product.images[0] ? (
                    <img
                      src={product.images[0]}
                      alt={`${product.title} thumbnail`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-background">
                      <span className="text-sm font-medium text-muted-foreground">
                        {t('labels.noImage')}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
                    <Checkbox
                      aria-label={t('labels.selectRow', { name: product.title })}
                      checked={selectedIds.includes(product.id)}
                      onChange={(event) =>
                        setSelectedIds((value) =>
                          event.target.checked
                            ? [...new Set([...value, product.id])]
                            : value.filter((id) => id !== product.id),
                        )
                      }
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge variant={product.active ? 'default' : 'outline'}>
                        {product.active ? t('labels.active') : t('labels.inactive')}
                      </Badge>
                      <Badge variant={product.inStock ? 'secondary' : 'outline'}>
                        {product.inStock ? t('labels.inStock') : t('actions.markOutOfStock')}
                      </Badge>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="line-clamp-2 text-left text-base font-semibold"
                        onClick={() => void openEdit(product)}
                      >
                        {product.title}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {[
                          brandNameById.get(product.brandId ?? -1),
                          categoryNameById.get(product.categoryId ?? -1),
                        ]
                          .filter(Boolean)
                          .join(' · ') || t('labels.productName')}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-border/70 bg-background/90 px-3 py-2 text-right shadow-sm backdrop-blur">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {t('labels.price')}
                      </p>
                      <p className="text-sm font-semibold">{formatCurrency(product.price, 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('labels.purchasePrice')}
                      </p>
                      <p className="mt-1 font-medium">{formatCurrency(product.purchasePrice)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('labels.inventoryQuantity')}
                      </p>
                      <p className="mt-1 font-medium">{product.inventoryQuantity}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('labels.created')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(product.createdAt)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('labels.modified')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(product.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{t('labels.active')}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.active ? t('labels.active') : t('labels.inactive')}
                        </p>
                      </div>
                      <Switch
                        checked={product.active}
                        aria-label={t('labels.active')}
                        onCheckedChange={(checked) =>
                          partialUpdateMutation.mutate({
                            id: product.id,
                            values: { active: checked },
                            messages: buildMessages(
                              t,
                              checked
                                ? 'notifications.products.activate.loading'
                                : 'notifications.products.deactivate.loading',
                              checked
                                ? 'notifications.products.activate.success'
                                : 'notifications.products.deactivate.success',
                              checked
                                ? 'notifications.products.activate.error'
                                : 'notifications.products.deactivate.error',
                              { name: product.title },
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{t('labels.inStock')}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.inStock ? t('labels.inStock') : t('actions.markOutOfStock')}
                        </p>
                      </div>
                      <Switch
                        checked={product.inStock}
                        aria-label={t('labels.inStock')}
                        onCheckedChange={(checked) =>
                          partialUpdateMutation.mutate({
                            id: product.id,
                            values: { inStock: checked },
                            messages: buildMessages(
                              t,
                              checked
                                ? 'notifications.products.stock.loading'
                                : 'notifications.products.unstock.loading',
                              checked
                                ? 'notifications.products.stock.success'
                                : 'notifications.products.unstock.success',
                              checked
                                ? 'notifications.products.stock.error'
                                : 'notifications.products.unstock.error',
                              { name: product.title },
                            ),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => void openEdit(product)}
                    >
                      {t('actions.modify')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setDeleteState({ ids: [product.id], label: product.title })}
                    >
                      {t('actions.delete')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <TablePaginationControls
            currentPage={productsQuery.data.pagination?.page ?? page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
        <SurfacePendingOverlay active={productsQuery.isFetching} label={t('labels.loading')} />
      </div>

      {dialogState.open ? (
        <ProductDialogForm
          open
          mode={dialogState.mode}
          form={form}
          pending={createMutation.isPending || updateMutation.isPending}
          editingId={dialogState.editingId}
          brandOptions={metaQuery.data.brands}
          categoryOptions={metaQuery.data.categories}
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
          onSubmit={submitDialog}
        />
      ) : null}

      <DeleteDialog
        open={Boolean(deleteState)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteState(null);
          }
        }}
        title={t('labels.deleteDialogTitle')}
        description={t('labels.deleteDialogDescription', { target: deleteState?.label ?? '' })}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteState) {
            return;
          }

          deleteMutation.mutate({
            ids: deleteState.ids,
            messages: buildMessages(
              t,
              'notifications.products.delete.loading',
              'notifications.products.delete.success',
              'notifications.products.delete.error',
              { target: deleteState.label },
            ),
          });
        }}
      />
      <MetaCatalogExportDialog
        state={metaCatalogExportState}
        onOpenChange={(open) => {
          if (!open) {
            setMetaCatalogExportState(null);
          }
        }}
        onConfirm={confirmMetaCatalogExport}
      />
    </motion.section>
  );
}
