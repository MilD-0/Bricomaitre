'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { requestJson as request } from '../../lib/admin-api';
import {
  inventoryApplyResponseSchema,
  inventoryBarcodeSchema,
  inventoryListResponseSchema,
  inventoryScanResponseSchema,
  type InventoryApplyResponse,
  type InventoryBarcodeInput,
  type InventoryListResponse,
  type InventoryRow,
  type InventoryScanResponse,
} from '../../lib/inventory';
import { getEffectiveSortRules, toggleSortRule } from '../../lib/multi-sort';
import { captureQueries, restoreQueries } from '../../lib/query-cache';
import { toast } from '../../lib/toast';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import {
  buildMessages,
  defaultInventorySort,
  updateInventoryLists,
  type BarcodeDialogState,
  type InventoryMutationVariables,
  type InventorySortKey,
  type InventorySortRule,
  type MutationContext,
  type ScanBarcodeState,
  type ScanOrderState,
} from './state';

export function useInventoryManager({ title }: { title: string }) {
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
    queryKey: ['inventory-table', page, deferredSearch, sortRules],
    queryFn: async () =>
      inventoryListResponseSchema.parse(
        await request(
          `/api/inventory?page=${page}&limit=50&search=${encodeURIComponent(deferredSearch)}&${new URLSearchParams(getEffectiveSortRules(sortRules, defaultInventorySort).map(({ key, direction }) => ['sort', `${key}:${direction}`]))}`,
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
  const batchRequestRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const batchApplyMutation = useMutation<
    InventoryApplyResponse,
    Error,
    {
      mode: 'increase';
      items: Array<{
        productId: number;
        quantity: number;
        source: { type: 'order-scan' | 'shopping-list' | 'barcode-scan'; orderIds?: number[] };
      }>;
    }
  >({
    mutationFn: async (payload) => {
      const fingerprint = JSON.stringify(payload);
      if (batchRequestRef.current?.fingerprint !== fingerprint) {
        batchRequestRef.current = { fingerprint, requestId: crypto.randomUUID() };
      }
      return inventoryApplyResponseSchema.parse(
        await request('/api/inventory/apply', {
          method: 'POST',
          body: JSON.stringify({ ...payload, requestId: batchRequestRef.current.requestId }),
        }),
      );
    },
    onSuccess: async () => {
      batchRequestRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ['inventory-table'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    },
  });

  const items = query.data?.items ?? [];

  const toggleSort = (key: InventorySortKey) => {
    startFilterTransition(() => {
      setSortRules((current) => toggleSortRule(current, key, 'asc'));
      setPage(1);
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
      const result = await batchApplyMutation.mutateAsync({
        mode: 'increase',
        items: [
          {
            productId: scanBarcodeState.item.id,
            quantity: 1,
            source: { type: 'barcode-scan' },
          },
        ],
      });
      if (!result.complete) throw new Error('The scanned product could not be received.');
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
      const result = await batchApplyMutation.mutateAsync({
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
      if (!result.complete) {
        const appliedIds = new Set(result.items.map((item) => item.productId));
        setScanOrderState((current) => ({
          ...current,
          items: current.items.filter((item) => !appliedIds.has(item.productId!)),
        }));
        toast.error(
          t('inventory.scan.orderApplyPartial', {
            count: result.items.length,
            failed: result.skipped.length,
          }),
          { id: toastId },
        );
        return;
      }
      toast.success(t('inventory.scan.orderApplySuccess', { count: result.items.length }), {
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

  return {
    view: {
      title,
      query,
      isFilterPending,
      t,
      scanQuery,
      setScanQuery,
      submitScan,
      scanMutation,
      batchApplyMutation,
      search,
      startFilterTransition,
      setPage,
      setSearch,
      isLoading,
      sortRules,
      toggleSort,
      items,
      writable,
      isMutating,
      openBarcodeDialog,
      changeQuantity,
      changeStock,
      page,
      barcodeDialogState,
      mutation,
      barcodeForm,
      closeBarcodeDialog,
      submitBarcode,
      scanBarcodeState,
      closeScanBarcodeDialog,
      confirmBarcodeScanAdd,
      scanOrderState,
      closeScanOrderDialog,
      toggleScanOrderItem,
      increaseScanOrderQuantity,
      decreaseScanOrderQuantity,
      confirmOrderScanAdd,
    } as const,
    fallback: null,
  };
}
