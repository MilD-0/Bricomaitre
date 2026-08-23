'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import {
  inventoryApplyResponseSchema,
  inventoryBarcodeSchema,
  inventoryListResponseSchema,
  inventoryScanResponseSchema,
  type InventoryApplyResponse,
  type InventoryBarcodeInput,
  type InventoryListResponse,
  type InventoryOrderScanItem,
  type InventoryRow,
  type InventoryScanResponse,
} from '../lib/inventory';
import {
  applyClientMultiSort,
  getEffectiveSortRules,
  getSortRuleState,
  toggleSortRule,
  type SortRule,
} from '../lib/multi-sort';
import { requestJson as request } from '../lib/admin-api';
import { captureQueries, restoreQueries, type QuerySnapshot } from '../lib/query-cache';
import { toast } from '../lib/toast';
import { MultiSortHeader } from './multi-sort-header';
import { useAdminAiSurfaceDetails } from './admin-ai-surface-context';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from './ui/motion';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { TablePaginationControls } from './table-pagination-controls';
import { SearchField } from './search-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from './ui/workspace';

type MutationMessages = {
  loading: string;
  success: string;
  error: string;
};

type MutationContext<T> = {
  messages: MutationMessages;
  snapshot: QuerySnapshot<T>;
  toastId: string;
};

type InventoryMutationVariables = {
  id: number;
  payload: { delta?: number; inStock?: boolean; barcode?: string | null };
  messages: MutationMessages;
};

type BarcodeDialogState = {
  open: boolean;
  item: InventoryRow | null;
};

type ScanBarcodeState = {
  open: boolean;
  item: InventoryRow | null;
};

type ScanOrderDraftItem = InventoryOrderScanItem & {
  selected: boolean;
  addQuantity: number;
};

type ScanOrderState = {
  open: boolean;
  order: { id: number; fullName: string } | null;
  items: ScanOrderDraftItem[];
};

type InventorySortKey = 'title' | 'inventoryQuantity' | 'inStock';
type InventorySortRule = SortRule<InventorySortKey>;
const defaultInventorySort: InventorySortRule[] = [{ key: 'title', direction: 'asc' }];

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

function updateInventoryLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (item: InventoryRow) => InventoryRow | null,
) {
  const snapshots = queryClient.getQueriesData<InventoryListResponse>({
    queryKey: ['inventory-table'],
  });

  snapshots.forEach(([key, current]) => {
    if (!current) {
      return;
    }

    const search = typeof key[2] === 'string' ? key[2] : '';
    const items = current.items
      .map(updater)
      .filter((item): item is InventoryRow => item !== null)
      .filter((item) => search.length > 0 || item.inventoryQuantity > 0);

    queryClient.setQueryData<InventoryListResponse>(key, {
      ...current,
      items,
    });
  });
}

function InventoryTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-28" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-8 w-8" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-11" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function BarcodeDialog({
  state,
  pending,
  form,
  onOpenChange,
  onSubmit,
}: {
  state: BarcodeDialogState;
  pending: boolean;
  form: ReturnType<typeof useForm<InventoryBarcodeInput>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.item?.barcode
              ? t('inventory.barcode.editTitle', { name: state.item.title })
              : t('inventory.barcode.addTitle', { name: state.item?.title ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('inventory.barcode.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={form.formState.errors.barcode ? '' : undefined}>
              <FieldLabel htmlFor="inventory-barcode">{t('inventory.columns.barcode')}</FieldLabel>
              <Input
                id="inventory-barcode"
                aria-invalid={form.formState.errors.barcode ? true : undefined}
                placeholder={t('inventory.barcode.placeholder')}
                {...form.register('barcode')}
              />
              {form.formState.errors.barcode ? (
                <FieldError>{form.formState.errors.barcode.message}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScanBarcodeDialog({
  state,
  pending,
  onOpenChange,
  onConfirm,
}: {
  state: ScanBarcodeState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.scan.barcodeTitle', { name: state.item?.title ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('inventory.scan.barcodeDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t('inventory.scan.confirmAddOne')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanOrderDialog({
  state,
  pending,
  onOpenChange,
  onToggleItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onConfirm,
}: {
  state: ScanOrderState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleItem: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none overflow-y-auto rounded-xl p-4 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-[1.5rem] sm:p-6">
        <DialogHeader>
          <DialogTitle>{t('inventory.scan.orderTitle', { id: state.order?.id ?? 0 })}</DialogTitle>
          <DialogDescription>{state.order?.fullName ?? ''}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          {state.items.map((item) => (
            <div key={`${item.productId ?? item.title}`} className="py-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={item.selected}
                  disabled={!item.selectable || pending}
                  onChange={() => item.productId != null && onToggleItem(item.productId)}
                  aria-label={t('inventory.scan.toggleOrderItem', { name: item.title })}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('inventory.scan.orderQuantity', { count: item.quantity })} •{' '}
                    {t('inventory.scan.currentInventory', { count: item.inventoryQuantity ?? 0 })}
                  </p>
                  {!item.selectable && item.reason ? (
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  ) : null}
                </div>
                {item.selectable && item.productId != null ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || item.addQuantity <= 1}
                      onClick={() => onDecreaseQuantity(item.productId!)}
                    >
                      -1
                    </Button>
                    <span className="min-w-10 text-center text-sm font-medium">
                      {item.addQuantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => onIncreaseQuantity(item.productId!)}
                    >
                      +1
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t('inventory.scan.confirmOrderAdd')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryManager({ title }: { title: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [scanQuery, setScanQuery] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [sortRules, setSortRules] = useState<InventorySortRule[]>([]);
  const [barcodeDialogState, setBarcodeDialogState] = useState<BarcodeDialogState>({
    open: false,
    item: null,
  });
  const [scanBarcodeState, setScanBarcodeState] = useState<ScanBarcodeState>({
    open: false,
    item: null,
  });
  const [scanOrderState, setScanOrderState] = useState<ScanOrderState>({
    open: false,
    order: null,
    items: [],
  });
  useAdminAiSurfaceDetails({
    filters: { page, search: deferredSearch },
    selection: {
      entityType: 'inventoryProduct',
      ids: scanOrderState.items.flatMap((item) =>
        item.selected && item.productId ? [item.productId] : [],
      ),
      focusedId: barcodeDialogState.item?.id ?? scanBarcodeState.item?.id ?? null,
    },
  });
  const [isFilterPending, startFilterTransition] = useTransition();

  const barcodeForm = useForm<InventoryBarcodeInput>({
    resolver: zodResolver(inventoryBarcodeSchema),
    defaultValues: { barcode: '' },
  });

  const query = useQuery({
    queryKey: ['inventory-table', page, deferredSearch],
    queryFn: async () =>
      inventoryListResponseSchema.parse(
        await request(
          `/api/inventory?page=${page}&limit=50&search=${encodeURIComponent(deferredSearch)}`,
        ),
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const mutation = useMutation<
    unknown,
    Error,
    InventoryMutationVariables,
    MutationContext<InventoryListResponse>
  >({
    mutationFn: ({ id, payload }) =>
      request(`/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onMutate: async ({ id, payload, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['inventory-table'] });
      const snapshot = captureQueries<InventoryListResponse>(queryClient, ['inventory-table']);
      const toastId = toast.loading(messages.loading);
      const now = new Date().toISOString();

      updateInventoryLists(queryClient, (item) => {
        if (item.id !== id) {
          return item;
        }

        if (payload.delta != null) {
          return {
            ...item,
            inventoryQuantity: Math.max(0, item.inventoryQuantity + payload.delta),
            updatedAt: now,
          };
        }

        if (payload.inStock != null) {
          return {
            ...item,
            inStock: payload.inStock,
            updatedAt: now,
          };
        }

        return {
          ...item,
          barcode: payload.barcode ?? null,
          updatedAt: now,
        };
      });

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      restoreQueries(queryClient, context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, variables, context) => {
      if (!context) {
        return;
      }

      if ('barcode' in variables.payload) {
        setBarcodeDialogState({ open: false, item: null });
        barcodeForm.reset({ barcode: '' });
      }

      if (variables.payload.delta != null && deferredSearch.length > 0) {
        setSearch('');
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-table'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    },
  });
  const scanMutation = useMutation<InventoryScanResponse, Error, string>({
    mutationFn: async (value) =>
      inventoryScanResponseSchema.parse(
        await request('/api/inventory/scan', {
          method: 'POST',
          body: JSON.stringify({ query: value }),
        }),
      ),
  });
  const batchApplyMutation = useMutation<
    InventoryApplyResponse,
    Error,
    {
      mode: 'increase';
      items: Array<{
        productId: number;
        quantity: number;
        source: { type: 'order-scan' | 'shopping-list'; orderIds?: number[] };
      }>;
    }
  >({
    mutationFn: async (payload) =>
      inventoryApplyResponseSchema.parse(
        await request('/api/inventory/apply', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-table'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    },
  });

  const items = useMemo(() => {
    return applyClientMultiSort(
      query.data?.items ?? [],
      getEffectiveSortRules(sortRules, defaultInventorySort),
      {
        title: (row) => row.title,
        inventoryQuantity: (row) => row.inventoryQuantity,
        inStock: (row) => row.inStock,
      },
    );
  }, [query.data?.items, sortRules]);

  const toggleSort = (key: InventorySortKey) => {
    startFilterTransition(() => {
      setSortRules((current) => toggleSortRule(current, key, 'asc'));
    });
  };

  const openBarcodeDialog = (item: InventoryRow) => {
    barcodeForm.reset({ barcode: item.barcode ?? '' });
    startFilterTransition(() => {
      setBarcodeDialogState({ open: true, item });
    });
  };

  const closeBarcodeDialog = () => {
    setBarcodeDialogState({ open: false, item: null });
    barcodeForm.reset({ barcode: '' });
  };

  const closeScanBarcodeDialog = () => {
    setScanBarcodeState({ open: false, item: null });
  };

  const closeScanOrderDialog = () => {
    setScanOrderState({ open: false, order: null, items: [] });
  };

  const submitBarcode = barcodeForm.handleSubmit(async (rawValues) => {
    if (!barcodeDialogState.item) {
      return;
    }

    const values = inventoryBarcodeSchema.parse(rawValues);
    await mutation.mutateAsync({
      id: barcodeDialogState.item.id,
      payload: { barcode: values.barcode },
      messages: buildMessages(
        t,
        barcodeDialogState.item.barcode
          ? 'inventory.notifications.barcode.save.loading'
          : 'inventory.notifications.barcode.create.loading',
        barcodeDialogState.item.barcode
          ? 'inventory.notifications.barcode.save.success'
          : 'inventory.notifications.barcode.create.success',
        barcodeDialogState.item.barcode
          ? 'inventory.notifications.barcode.save.error'
          : 'inventory.notifications.barcode.create.error',
        { name: barcodeDialogState.item.title },
      ),
    });
  });

  async function submitScan() {
    const normalized = scanQuery.trim();
    if (!normalized) {
      return;
    }

    try {
      const response = await scanMutation.mutateAsync(normalized);

      if (response.kind === 'barcode') {
        setScanBarcodeState({ open: true, item: response.item });
        return;
      }

      if (response.kind === 'order') {
        setScanOrderState({
          open: true,
          order: response.order,
          items: response.items.map((item) => ({
            ...item,
            selected: item.selectable,
            addQuantity: item.quantity,
          })),
        });
        return;
      }

      toast.error(t('inventory.scan.notFound'));
    } catch {
      toast.error(t('inventory.scan.error'));
    }
  }

  async function confirmBarcodeScanAdd() {
    if (!scanBarcodeState.item) {
      return;
    }

    const toastId = toast.loading(
      t('inventory.notifications.quantity.scan.loading', { name: scanBarcodeState.item.title }),
    );

    try {
      await batchApplyMutation.mutateAsync({
        mode: 'increase',
        items: [
          {
            productId: scanBarcodeState.item.id,
            quantity: 1,
            source: { type: 'order-scan' },
          },
        ],
      });
      toast.success(
        t('inventory.notifications.quantity.scan.success', { name: scanBarcodeState.item.title }),
        { id: toastId },
      );
      closeScanBarcodeDialog();
      setScanQuery('');
    } catch {
      toast.error(
        t('inventory.notifications.quantity.scan.error', { name: scanBarcodeState.item.title }),
        { id: toastId },
      );
    }
  }

  function toggleScanOrderItem(productId: number) {
    setScanOrderState((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.productId === productId ? { ...item, selected: !item.selected } : item,
      ),
    }));
  }

  function increaseScanOrderQuantity(productId: number) {
    setScanOrderState((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.productId === productId ? { ...item, addQuantity: item.addQuantity + 1 } : item,
      ),
    }));
  }

  function decreaseScanOrderQuantity(productId: number) {
    setScanOrderState((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.productId === productId
          ? { ...item, addQuantity: Math.max(1, item.addQuantity - 1) }
          : item,
      ),
    }));
  }

  async function confirmOrderScanAdd() {
    const selectedItems = scanOrderState.items.filter(
      (item) => item.productId != null && item.selectable && item.selected && item.addQuantity > 0,
    );
    if (selectedItems.length === 0) {
      toast.error(t('inventory.scan.noSelection'));
      return;
    }

    const toastId = toast.loading(
      t('inventory.scan.orderApplyLoading', { count: selectedItems.length }),
    );

    try {
      await batchApplyMutation.mutateAsync({
        mode: 'increase',
        items: selectedItems.map((item) => ({
          productId: item.productId!,
          quantity: item.addQuantity,
          source: {
            type: 'order-scan',
            orderIds: scanOrderState.order ? [scanOrderState.order.id] : undefined,
          },
        })),
      });
      toast.success(t('inventory.scan.orderApplySuccess', { count: selectedItems.length }), {
        id: toastId,
      });
      closeScanOrderDialog();
      setScanQuery('');
    } catch {
      toast.error(t('inventory.scan.orderApplyError', { count: selectedItems.length }), {
        id: toastId,
      });
    }
  }

  const writable = query.data?.writable ?? false;
  const isLoading = query.isPending;
  const isMutating = mutation.isPending || batchApplyMutation.isPending;

  function changeQuantity(item: InventoryRow, delta: -1 | 1) {
    const direction = delta > 0 ? 'increase' : 'decrease';
    mutation.mutate({
      id: item.id,
      payload: { delta },
      messages: buildMessages(
        t,
        `inventory.notifications.quantity.${direction}.loading`,
        `inventory.notifications.quantity.${direction}.success`,
        `inventory.notifications.quantity.${direction}.error`,
        { name: item.title },
      ),
    });
  }

  function changeStock(item: InventoryRow, checked: boolean) {
    const direction = checked ? 'enable' : 'disable';
    mutation.mutate({
      id: item.id,
      payload: { inStock: checked },
      messages: buildMessages(
        t,
        `inventory.notifications.stock.${direction}.loading`,
        `inventory.notifications.stock.${direction}.success`,
        `inventory.notifications.stock.${direction}.error`,
        { name: item.title },
      ),
    });
  }

  return (
    <WorkspaceFrame>
      <motion.section
        className="scroll-mt-24"
        {...sectionTransitionProps}
        data-admin-workspace="inventory"
      >
        <WorkspaceHeader>
          <WorkspaceHeading
            title={title}
            meta={query.data?.pagination.totalItems}
            description={
              <PendingInline
                active={isFilterPending || query.isFetching}
                label={t('labels.loading')}
              />
            }
          />
        </WorkspaceHeader>

        <WorkspaceToolbar className="grid gap-3 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(18rem,1.2fr)]">
          <section className="min-w-0">
            <p className="text-sm font-medium">{t('inventory.scan.title')}</p>
            <p className="text-xs text-muted-foreground">{t('inventory.scan.description')}</p>
            <div className="mt-2 flex gap-2">
              <Input
                value={scanQuery}
                onChange={(event) => setScanQuery(event.target.value)}
                placeholder={t('inventory.scan.placeholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitScan();
                  }
                }}
              />
              <Button
                type="button"
                disabled={
                  scanMutation.isPending ||
                  batchApplyMutation.isPending ||
                  scanQuery.trim().length === 0
                }
                onClick={() => void submitScan()}
              >
                {t('inventory.scan.action')}
              </Button>
            </div>
          </section>
          <div className="flex min-w-0 items-end">
            <SearchField
              value={search}
              placeholder={t('inventory.searchPlaceholder')}
              onChange={(value) => {
                startFilterTransition(() => {
                  setPage(1);
                  setSearch(value);
                });
              }}
            />
          </div>
        </WorkspaceToolbar>

        <div className="relative" aria-busy={query.isFetching && !isLoading}>
          <div
            className={
              query.isFetching && !isLoading
                ? 'transition-opacity duration-200 opacity-70'
                : 'transition-opacity duration-200'
            }
          >
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      <MultiSortHeader
                        label={t('inventory.columns.product')}
                        sortState={getSortRuleState(sortRules, 'title')}
                        onClick={() => toggleSort('title')}
                      />
                    </TableHead>
                    <TableHead>{t('inventory.columns.barcode')}</TableHead>
                    <TableHead>
                      <MultiSortHeader
                        label={t('inventory.columns.quantity')}
                        sortState={getSortRuleState(sortRules, 'inventoryQuantity')}
                        onClick={() => toggleSort('inventoryQuantity')}
                      />
                    </TableHead>
                    <TableHead className="w-40">
                      <MultiSortHeader
                        label={t('inventory.columns.inStock')}
                        sortState={getSortRuleState(sortRules, 'inStock')}
                        onClick={() => toggleSort('inStock')}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? <InventoryTableSkeleton /> : null}

                  {!isLoading && items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4}>
                        <Empty className="border-none">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Search />
                            </EmptyMedia>
                            <EmptyTitle>{t('inventory.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('inventory.empty')}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!isLoading
                    ? items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{item.title}</span>
                              <span className="text-sm text-muted-foreground">
                                {item.sku
                                  ? t('inventory.productMeta', { sku: item.sku })
                                  : t('inventory.noSku')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant={item.barcode ? 'ghost' : 'outline'}
                              size="sm"
                              disabled={!writable || isMutating}
                              onClick={() => openBarcodeDialog(item)}
                            >
                              {item.barcode ?? t('inventory.addBarcode')}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={t('inventory.decreaseRow', { name: item.title })}
                                disabled={!writable || isMutating || item.inventoryQuantity === 0}
                                onClick={() => changeQuantity(item, -1)}
                              >
                                -1
                              </Button>
                              <div className="min-w-12 text-center">
                                <p className="font-medium">{item.inventoryQuantity}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                aria-label={t('inventory.increaseRow', { name: item.title })}
                                disabled={!writable || isMutating}
                                onClick={() => changeQuantity(item, 1)}
                              >
                                +1
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.updatedAt).toLocaleString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={item.inStock}
                              aria-label={t('inventory.toggleStock', { name: item.title })}
                              disabled={!writable || isMutating}
                              onCheckedChange={(checked) => changeStock(item, checked)}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>

            <div
              className="divide-y divide-border/60 border-b border-border/60 md:hidden"
              data-mobile-inventory-list
            >
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="space-y-3 px-3 py-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))
                : null}
              {!isLoading && items.length === 0 ? (
                <Empty className="border-none px-3 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>{t('inventory.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('inventory.empty')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
              {!isLoading
                ? items.map((item) => (
                    <article key={item.id} className="px-3 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.sku
                              ? t('inventory.productMeta', { sku: item.sku })
                              : t('inventory.noSku')}
                          </p>
                        </div>
                        <Switch
                          checked={item.inStock}
                          aria-label={t('inventory.toggleStock', { name: item.title })}
                          disabled={!writable || isMutating}
                          onCheckedChange={(checked) => changeStock(item, checked)}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={item.barcode ? 'ghost' : 'outline'}
                          size="sm"
                          className="min-w-0 max-w-[45%] truncate"
                          disabled={!writable || isMutating}
                          onClick={() => openBarcodeDialog(item)}
                        >
                          {item.barcode ?? t('inventory.addBarcode')}
                        </Button>
                        <div className="ms-auto flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="size-8 px-0"
                            aria-label={t('inventory.decreaseRow', { name: item.title })}
                            disabled={!writable || isMutating || item.inventoryQuantity === 0}
                            onClick={() => changeQuantity(item, -1)}
                          >
                            −
                          </Button>
                          <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                            {item.inventoryQuantity}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="size-8 px-0"
                            aria-label={t('inventory.increaseRow', { name: item.title })}
                            disabled={!writable || isMutating}
                            onClick={() => changeQuantity(item, 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                : null}
            </div>

            <TablePaginationControls
              currentPage={query.data?.pagination.page ?? page}
              totalPages={query.data?.pagination.totalPages ?? 1}
              onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))}
            />
          </div>
          <SurfacePendingOverlay
            active={query.isFetching && !isLoading}
            label={t('inventory.refreshing')}
          />
        </div>

        <BarcodeDialog
          state={barcodeDialogState}
          pending={mutation.isPending}
          form={barcodeForm}
          onOpenChange={(open) => {
            if (!open) {
              closeBarcodeDialog();
            }
          }}
          onSubmit={submitBarcode}
        />
        <ScanBarcodeDialog
          state={scanBarcodeState}
          pending={batchApplyMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeScanBarcodeDialog();
            }
          }}
          onConfirm={() => void confirmBarcodeScanAdd()}
        />
        <ScanOrderDialog
          state={scanOrderState}
          pending={batchApplyMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeScanOrderDialog();
            }
          }}
          onToggleItem={toggleScanOrderItem}
          onIncreaseQuantity={increaseScanOrderQuantity}
          onDecreaseQuantity={decreaseScanOrderQuantity}
          onConfirm={() => void confirmOrderScanAdd()}
        />
      </motion.section>
    </WorkspaceFrame>
  );
}
