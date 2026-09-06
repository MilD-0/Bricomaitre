'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, ShoppingBasket } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { AdminApiError, requestJson as request } from '../../lib/admin-api';
import type { OrdersResponse } from '../../lib/order-admin-contracts';
import { ORDER_STATUS, parseNumericAmount, type OrderRecord } from '../../lib/orders';
import {
  buildShoppingListInventoryPreview,
  reconcileShoppingListAllocations,
  type ShoppingListDraftItem,
  type ShoppingListDraftRecord,
  type ShoppingListSourceMode,
} from '../../lib/shopping-list-drafts';
import { toast } from '../../lib/toast';
import { SplitActionButton } from '../split-action-button';
import type { ProductSearchItem } from './order-products-editor';
import {
  buildMergedShoppingListState,
  buildShoppingListPrintHtml,
  buildShoppingListStateFromDraft,
  fetchShoppingListDraft,
  recalculateShoppingListInventory,
  resetShoppingListDraft,
  saveShoppingListDraft,
  type BrandLookupResponse,
  type ProductLookupResponse,
} from './orders-shopping-list';
import {
  EcotrackPostingWorkspaceDialog,
  ShoppingListWorkspaceDialog,
} from './orders-workflow-dialogs';
import type {
  EcotrackPostingPreviewState,
  EcotrackPostingSummary,
  EcotrackPreviewResponse,
  ExportProgressState,
  ShoppingListSaveStatus,
  ShoppingListState,
} from './orders-workflow-model';
import {
  ShoppingInventoryReviewDialog,
  shoppingInventoryReviewLabel,
} from './shopping-inventory-review';

type OrderJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { phase: string; current: number; total: number; percentage: number };
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
};
type OrderJobResponse = { job: OrderJob | null };
type InventoryApplyResponse = {
  ok: true;
  items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }>;
  skipped: Array<{ productId: number; reason: string }>;
};
type StatusShoppingListMode = Exclude<ShoppingListSourceMode, 'selected'>;

const shoppingListStatusConfig: Record<
  StatusShoppingListMode,
  { statuses: Array<OrderRecord['inHouseStatus']>; titleKey: string; emptyKey: string }
> = {
  confirmed: {
    statuses: [ORDER_STATUS.CONFIRMED],
    titleKey: 'ordersManager.shoppingList.confirmedTitle',
    emptyKey: 'ordersManager.shoppingList.emptyConfirmed',
  },
  dispatched: {
    statuses: [ORDER_STATUS.DISPATCHED],
    titleKey: 'ordersManager.shoppingList.dispatchedTitle',
    emptyKey: 'ordersManager.shoppingList.emptyDispatched',
  },
  posted: {
    statuses: [ORDER_STATUS.POSTED],
    titleKey: 'ordersManager.shoppingList.postedTitle',
    emptyKey: 'ordersManager.shoppingList.emptyPosted',
  },
  'posted-and-confirmed': {
    statuses: [ORDER_STATUS.POSTED, ORDER_STATUS.CONFIRMED],
    titleKey: 'ordersManager.shoppingList.postedAndConfirmedTitle',
    emptyKey: 'ordersManager.shoppingList.emptyPostedAndConfirmed',
  },
};

export function OrdersWorkflows({
  selectedOrders,
  writable,
  onOrdersChanged,
}: {
  selectedOrders: OrderRecord[];
  writable: boolean;
  onOrdersChanged: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [shoppingListState, setShoppingListState] = useState<ShoppingListState>(null);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [stockReviewOpen, setStockReviewOpen] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [shoppingListSaveStatus, setShoppingListSaveStatus] =
    useState<ShoppingListSaveStatus>('idle');
  const [ecotrackPreviewState, setEcotrackPreviewState] =
    useState<EcotrackPostingPreviewState>(null);
  const [activeEcotrackJobId, setActiveEcotrackJobId] = useState<string | null>(null);
  const selectedShoppingListOrdersRef = useRef<OrderRecord[]>([]);
  const shoppingListSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shoppingListSaveSeqRef = useRef(0);
  const announcedJobIdsRef = useRef<Set<string>>(new Set());
  const lastEcotrackStatusRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (shoppingListSaveTimeoutRef.current) clearTimeout(shoppingListSaveTimeoutRef.current);
    },
    [],
  );

  const ecotrackJobQuery = useQuery({
    queryKey: ['orders-selected-ecotrack-job', activeEcotrackJobId],
    queryFn: () =>
      request<OrderJobResponse>(
        `/api/orders/ecotrack?jobId=${encodeURIComponent(activeEcotrackJobId ?? '')}`,
      ),
    enabled: activeEcotrackJobId !== null,
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const previewEcotrackMutation = useMutation({
    mutationFn: (payload: {
      mode: 'selected' | 'confirmed';
      provider?: 'delivro' | 'emir';
      orderIds: number[];
    }) =>
      request<EcotrackPreviewResponse>('/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
  const startEcotrackMutation = useMutation({
    mutationFn: (payload: {
      mode: 'selected' | 'confirmed';
      provider?: 'delivro' | 'emir';
      orderIds: number[];
    }) =>
      request<OrderJobResponse>('/api/orders/ecotrack', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
  const cancelEcotrackMutation = useMutation({
    mutationFn: () => request<OrderJobResponse>('/api/orders/ecotrack', { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-selected-ecotrack-job'] });
    },
  });
  const addShoppingListProductMutation = useMutation({
    mutationFn: async (product: ProductSearchItem) => {
      const detail = await request<ProductLookupResponse>(`/api/products/${product.id}`);
      const brandId = detail.item.brandId ?? null;
      const brandName =
        brandId === null
          ? t('labels.noBrand')
          : (await request<BrandLookupResponse>(`/api/brands/${brandId}`)).name;
      return { product: detail.item, brandName };
    },
  });
  type InventoryRequest = {
    sourceMode: ShoppingListSourceMode;
    orderIds: number[];
    revision: number;
    draftIds: string[];
  };
  const inventoryEdits = (items: ShoppingListDraftItem[]) =>
    JSON.stringify(
      items.map(({ draftId, quantity, inventoryDecreaseQuantity, checked }) => ({
        draftId,
        quantity,
        inventoryDecreaseQuantity,
        checked,
      })),
    );
  const inventoryRequestRef = useRef<{
    fingerprint: string;
    requestId: string;
    payload: InventoryRequest;
    draftFingerprint: string;
  } | null>(null);
  const applyInventoryMutation = useMutation({
    mutationFn: (payload: {
      sourceMode: ShoppingListSourceMode;
      orderIds: number[];
      revision: number;
      draftIds: string[];
    }) => {
      const fingerprint = JSON.stringify(payload);
      if (inventoryRequestRef.current?.fingerprint !== fingerprint) {
        inventoryRequestRef.current = {
          fingerprint,
          requestId: crypto.randomUUID(),
          payload,
          draftFingerprint: inventoryEdits(shoppingListState?.draftItems ?? []),
        };
      }
      return request<InventoryApplyResponse & { draft: ShoppingListDraftRecord }>(
        '/api/orders/shopping-list-draft/apply',
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, requestId: inventoryRequestRef.current.requestId }),
        },
      );
    },
    onError: (error) => {
      if (error instanceof AdminApiError && error.status >= 400 && error.status < 500)
        inventoryRequestRef.current = null;
    },
    onSuccess: async () => {
      inventoryRequestRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-table'] }),
        queryClient.invalidateQueries({ queryKey: ['products-workspace'] }),
      ]);
    },
  });

  const ecotrackJob = ecotrackJobQuery.data.job;
  const ecotrackProgress: ExportProgressState =
    ecotrackJob && (ecotrackJob.status === 'queued' || ecotrackJob.status === 'running')
      ? {
          phase: ecotrackJob.progress.phase,
          current: ecotrackJob.progress.current,
          total: ecotrackJob.progress.total,
        }
      : null;
  const ecotrackSummary =
    (ecotrackJob?.resultSummary as EcotrackPostingSummary | null | undefined) ?? null;

  useEffect(() => {
    const statusKey = ecotrackJob ? `${ecotrackJob.id}:${ecotrackJob.status}` : null;
    if (!statusKey || statusKey === lastEcotrackStatusRef.current) return;
    lastEcotrackStatusRef.current = statusKey;
    if (!ecotrackJob || !announcedJobIdsRef.current.has(ecotrackJob.id)) return;

    if (ecotrackJob.status === 'completed') {
      toast.success(t('ordersManager.ecotrack.success'));
      announcedJobIdsRef.current.delete(ecotrackJob.id);
      void onOrdersChanged();
    } else if (ecotrackJob.status === 'cancelled') {
      toast.success(t('ordersManager.ecotrack.cancelled'));
      announcedJobIdsRef.current.delete(ecotrackJob.id);
    } else if (ecotrackJob.status === 'failed') {
      toast.error(ecotrackJob.errorMessage || t('ordersManager.ecotrack.error'));
      announcedJobIdsRef.current.delete(ecotrackJob.id);
    }
  }, [ecotrackJob, onOrdersChanged, t]);

  async function fetchOrdersByStatus(status: OrderRecord['inHouseStatus']) {
    const items: OrderRecord[] = [];
    let nextPage = 1;
    let totalPages = 1;

    do {
      const response = await request<OrdersResponse>(
        `/api/orders?page=${nextPage}&limit=100&inHouseStatus=${status}&search=&sortKey=createdAt&sortDirection=desc`,
      );
      items.push(...response.items);
      totalPages = response.pagination.totalPages;
      nextPage += 1;
    } while (nextPage <= totalPages);

    return items;
  }

  async function fetchOrdersForShoppingListSource(sourceMode: StatusShoppingListMode) {
    const batches = await Promise.all(
      shoppingListStatusConfig[sourceMode].statuses.map((status) => fetchOrdersByStatus(status)),
    );
    const seen = new Set<number>();
    return batches.flat().filter((order) => {
      if (seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    });
  }

  async function saveShoppingListNow(nextState: NonNullable<ShoppingListState>) {
    if (shoppingListSaveTimeoutRef.current) {
      clearTimeout(shoppingListSaveTimeoutRef.current);
      shoppingListSaveTimeoutRef.current = null;
    }
    const sequence = shoppingListSaveSeqRef.current + 1;
    shoppingListSaveSeqRef.current = sequence;
    setShoppingListSaveStatus('saving');

    try {
      const response = await saveShoppingListDraft(nextState);
      if (shoppingListSaveSeqRef.current === sequence) setShoppingListSaveStatus('saved');
      setShoppingListState((current) =>
        current?.scopeKey === response.draft.scopeKey
          ? {
              ...reconcileShoppingListAllocations(current, response.draft),
              revision: response.draft.revision,
              updatedAt: response.draft.updatedAt,
              updatedByName: response.draft.updatedByName,
            }
          : current,
      );
      return response;
    } catch {
      if (shoppingListSaveSeqRef.current === sequence) setShoppingListSaveStatus('error');
      throw new Error('Unable to save shopping list draft');
    }
  }

  function scheduleShoppingListSave(nextState: NonNullable<ShoppingListState>) {
    if (shoppingListSaveTimeoutRef.current) clearTimeout(shoppingListSaveTimeoutRef.current);
    setShoppingListSaveStatus('saving');
    shoppingListSaveTimeoutRef.current = setTimeout(() => {
      void saveShoppingListNow(nextState).catch(() =>
        toast.error(t('ordersManager.shoppingList.saveError')),
      );
    }, 400);
  }

  async function openShoppingListForOrders(orders: OrderRecord[], title: string) {
    if (orders.length === 0) {
      toast.error(t('ordersManager.shoppingList.emptySelection'));
      return;
    }
    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));
    const orderIds = orders.map((order) => order.id);
    selectedShoppingListOrdersRef.current = orders;

    try {
      const cached = await fetchShoppingListDraft('selected', orderIds);
      if (cached.draft) {
        setShoppingListState(buildShoppingListStateFromDraft(cached.draft, title));
        setShoppingListSaveStatus('idle');
        setShoppingListOpen(true);
        toast.success(t('ordersManager.shoppingList.sharedDraftLoaded'), { id: toastId });
        return;
      }
      const { state, loadedSharedDraft } = await buildMergedShoppingListState(
        orders,
        'selected',
        title,
      );
      setShoppingListState(state);
      setShoppingListSaveStatus('idle');
      setShoppingListOpen(true);
      toast.success(
        t(
          loadedSharedDraft
            ? 'ordersManager.shoppingList.sharedDraftLoaded'
            : 'ordersManager.shoppingList.ready',
        ),
        { id: toastId },
      );
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function openStatusShoppingList(sourceMode: StatusShoppingListMode) {
    const toastId = toast.loading(t('ordersManager.shoppingList.loading'));
    const config = shoppingListStatusConfig[sourceMode];
    const title = t(config.titleKey);

    try {
      const cached = await fetchShoppingListDraft(sourceMode, []);
      if (cached.draft) {
        setShoppingListState(buildShoppingListStateFromDraft(cached.draft, title));
        setShoppingListSaveStatus('idle');
        setShoppingListOpen(true);
        toast.success(t('ordersManager.shoppingList.sharedDraftLoaded'), { id: toastId });
        return;
      }
      const orders = await fetchOrdersForShoppingListSource(sourceMode);
      if (orders.length === 0) {
        toast.error(t(config.emptyKey), { id: toastId });
        return;
      }
      const { state, loadedSharedDraft } = await buildMergedShoppingListState(
        orders,
        sourceMode,
        title,
      );
      setShoppingListState(state);
      setShoppingListSaveStatus('idle');
      setShoppingListOpen(true);
      toast.success(
        t(
          loadedSharedDraft
            ? 'ordersManager.shoppingList.sharedDraftLoaded'
            : 'ordersManager.shoppingList.ready',
        ),
        { id: toastId },
      );
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  function updateShoppingListState(
    updater: (state: NonNullable<ShoppingListState>) => NonNullable<ShoppingListState>,
    persist = false,
  ) {
    setShoppingListState((current) => {
      if (!current) return current;
      const next = updater(current);
      if (persist) scheduleShoppingListSave(next);
      return next;
    });
  }

  function updateShoppingListItems(
    updater: (items: ShoppingListDraftItem[]) => ShoppingListDraftItem[],
  ) {
    updateShoppingListState(
      (current) => ({ ...current, draftItems: updater(current.draftItems) }),
      true,
    );
  }

  async function resetShoppingList() {
    if (!shoppingListState) return;
    if (shoppingListSaveTimeoutRef.current) clearTimeout(shoppingListSaveTimeoutRef.current);
    try {
      if (shoppingListState.revision === null) {
        setShoppingListState({
          ...shoppingListState,
          draftItems: shoppingListState.generatedItems
            .filter((item) => !item.inventoryLedgerOnly)
            .map((item) => ({ ...item, checked: false })),
          search: '',
        });
        setShoppingListSaveStatus('idle');
        return;
      }
      const response = await resetShoppingListDraft({
        ...shoppingListState,
        revision: shoppingListState.revision,
      });
      setShoppingListState(buildShoppingListStateFromDraft(response.draft));
      setShoppingListSaveStatus('saved');
    } catch {
      setShoppingListSaveStatus('error');
      toast.error(t('ordersManager.shoppingList.saveError'));
    }
  }

  async function refreshShoppingList() {
    if (!shoppingListState) return;
    if (shoppingListState.draftItems.some((item) => item.inventoryAllocationReview)) {
      await openStockReview();
      return;
    }
    const toastId = toast.loading(t('ordersManager.shoppingList.refreshing'));
    try {
      const orders =
        shoppingListState.sourceMode === 'selected'
          ? selectedShoppingListOrdersRef.current.filter((order) =>
              shoppingListState.orderIds.includes(order.id),
            )
          : await fetchOrdersForShoppingListSource(shoppingListState.sourceMode);
      if (orders.length === 0 && shoppingListState.sourceMode === 'selected') {
        toast.error(t('ordersManager.shoppingList.emptySelection'), { id: toastId });
        return;
      }
      const { state } = await buildMergedShoppingListState(
        orders,
        shoppingListState.sourceMode,
        shoppingListState.title,
      );
      setShoppingListState(state);
      await saveShoppingListNow(state);
      toast.success(t('ordersManager.shoppingList.refreshReady'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.shoppingList.error'), { id: toastId });
    }
  }

  async function addShoppingListProduct(product: ProductSearchItem) {
    try {
      const { product: detail, brandName } =
        await addShoppingListProductMutation.mutateAsync(product);
      updateShoppingListState((current) => {
        const existing = current.draftItems.find((item) => item.productId === detail.id);
        if (existing) {
          return {
            ...current,
            search: '',
            draftItems: current.draftItems.map((item) =>
              item.productId === detail.id
                ? recalculateShoppingListInventory(item, { quantity: item.quantity + 1 })
                : item,
            ),
          };
        }
        const nextItem: ShoppingListDraftItem = {
          draftId: `custom:${detail.id}`,
          productId: detail.id,
          brandId: detail.brandId ?? null,
          brandName,
          title: detail.title ?? product.title,
          quantity: 1,
          unitPrice:
            detail.price == null
              ? parseNumericAmount(product.price)
              : parseNumericAmount(detail.price),
          purchasePrice:
            detail.purchasePrice == null ? null : parseNumericAmount(detail.purchasePrice),
          thumbnailUrl: detail.images?.[0] ?? product.images[0] ?? null,
          inventoryQuantity: detail.inventoryQuantity,
          ...buildShoppingListInventoryPreview(1, detail.inventoryQuantity),
          notes: [],
          checked: false,
          isCustom: true,
          generatedAt: new Date().toISOString(),
        };
        return { ...current, search: '', draftItems: [...current.draftItems, nextItem] };
      }, true);
    } catch {
      toast.error(t('ordersManager.shoppingList.addProductError'));
    }
  }

  async function openStockReview() {
    if (!shoppingListState) return;
    try {
      await saveShoppingListNow(shoppingListState);
      setStockReviewOpen(true);
    } catch {
      toast.error(t('ordersManager.shoppingList.saveError'));
    }
  }

  async function applyInventoryChanges(checkedOnly: boolean) {
    if (!shoppingListState) return;
    if (shoppingListState.draftItems.some((item) => item.inventoryAllocationReview)) {
      await openStockReview();
      return;
    }
    const candidates = shoppingListState.draftItems.filter(
      (item) =>
        item.productId != null &&
        item.inventoryDecreaseQuantity > 0 &&
        item.quantity > item.inventoryAppliedQuantity &&
        item.inventoryActionEligible &&
        (!checkedOnly || item.checked),
    );
    const previousRequest = inventoryRequestRef.current?.payload;
    const retryRequest =
      previousRequest &&
      previousRequest.sourceMode === shoppingListState.sourceMode &&
      JSON.stringify(previousRequest.orderIds) === JSON.stringify(shoppingListState.orderIds)
        ? previousRequest
        : null;
    if (candidates.length === 0 && !retryRequest) {
      toast.error(t('ordersManager.shoppingList.noInventoryChanges'));
      return;
    }
    const retainedEdits =
      retryRequest &&
      inventoryEdits(shoppingListState.draftItems) !==
        inventoryRequestRef.current?.draftFingerprint;
    setInventoryBusy(true);
    if (shoppingListSaveTimeoutRef.current) clearTimeout(shoppingListSaveTimeoutRef.current);
    const toastId = toast.loading(
      t('ordersManager.shoppingList.inventoryApplyLoading', { count: candidates.length }),
    );
    try {
      // An accepted response may have been lost. Replay its exact request before
      // saving another revision; the server returns the original allocation result.
      const saved = retryRequest ? null : await saveShoppingListNow(shoppingListState);
      const response = await applyInventoryMutation.mutateAsync(
        retryRequest ?? {
          sourceMode: saved!.draft.sourceMode,
          orderIds: saved!.draft.orderIds,
          revision: saved!.draft.revision,
          draftIds: candidates.map((item) => item.draftId),
        },
      );
      let nextState = buildShoppingListStateFromDraft(response.draft);
      if (retainedEdits) {
        nextState = reconcileShoppingListAllocations(
          {
            ...nextState,
            draftItems: shoppingListState.draftItems.map((item) => ({
              ...item,
              inventoryQuantity:
                response.draft.draftItems.find(
                  (savedItem) => savedItem.productId === item.productId,
                )?.inventoryQuantity ?? item.inventoryQuantity,
            })),
          },
          response.draft,
        );
      }
      setShoppingListState((current) =>
        current?.scopeKey === nextState.scopeKey ? nextState : current,
      );
      if (retainedEdits) {
        try {
          await saveShoppingListNow(nextState);
        } catch {
          toast.error(t('ordersManager.shoppingList.saveError'));
        }
      } else {
        setShoppingListSaveStatus('saved');
      }
      toast.success(
        t('ordersManager.shoppingList.inventoryApplySuccess', { count: response.items.length }),
        { id: toastId },
      );
      if (response.draft.draftItems.some((item) => item.inventoryAllocationReview))
        setStockReviewOpen(true);
      if (response.skipped.length > 0) {
        toast.error(
          response.skipped.map((item) => `${item.productId}: ${item.reason}`).join(' | '),
        );
      }
    } catch {
      toast.error(
        t('ordersManager.shoppingList.inventoryApplyError', { count: candidates.length }),
        { id: toastId },
      );
    } finally {
      setInventoryBusy(false);
    }
  }

  async function openEcotrackPreview(
    mode: 'selected' | 'confirmed',
    provider: 'delivro' | 'emir',
    orders: OrderRecord[],
  ) {
    if (orders.length === 0) {
      toast.error(
        t(
          mode === 'selected'
            ? 'ordersManager.ecotrack.empty'
            : 'ordersManager.ecotrack.emptyConfirmed',
        ),
      );
      return;
    }
    const orderIds = orders.map((order) => order.id);
    const toastId = toast.loading(t('ordersManager.ecotrack.loading'));
    try {
      const preview = await previewEcotrackMutation.mutateAsync({
        mode,
        ...(provider === 'emir' ? { provider } : {}),
        orderIds,
      });
      setActiveEcotrackJobId(null);
      setEcotrackPreviewState({
        mode,
        provider,
        orderIds,
        title: t(
          provider === 'delivro'
            ? mode === 'selected'
              ? 'ordersManager.ecotrack.selectedTitle'
              : 'ordersManager.ecotrack.confirmedTitle'
            : mode === 'selected'
              ? 'ordersManager.ecotrack.emirSelectedTitle'
              : 'ordersManager.ecotrack.emirConfirmedTitle',
          { count: orders.length },
        ),
        preview,
      });
      toast.success(t('ordersManager.ecotrack.ready'), { id: toastId });
    } catch {
      toast.error(t('ordersManager.ecotrack.error'), { id: toastId });
    }
  }

  async function openConfirmedEcotrack(provider: 'delivro' | 'emir') {
    await openEcotrackPreview(
      'confirmed',
      provider,
      await fetchOrdersByStatus(ORDER_STATUS.CONFIRMED),
    );
  }

  async function confirmEcotrackPosting() {
    if (!ecotrackPreviewState) return;
    try {
      const response = await startEcotrackMutation.mutateAsync({
        mode: ecotrackPreviewState.mode,
        ...(ecotrackPreviewState.provider === 'emir' ? { provider: 'emir' as const } : {}),
        orderIds: ecotrackPreviewState.orderIds,
      });
      const jobId = response.job?.id ?? null;
      setActiveEcotrackJobId(jobId);
      if (jobId) announcedJobIdsRef.current.add(jobId);
    } catch {
      toast.error(t('ordersManager.ecotrack.error'));
    }
  }

  function printShoppingList() {
    if (!shoppingListState) return;
    const printWindow = window.open('about:blank', '_blank');
    if (!printWindow) {
      toast.error(t('ordersManager.shoppingList.printError'));
      return;
    }
    printWindow.document.open();
    printWindow.document.write(
      buildShoppingListPrintHtml(
        shoppingListState,
        locale,
        t('ordersManager.shoppingList.previousGeneration'),
        {
          generated: (value) => t('ordersManager.shoppingList.generatedAt', { date: value }),
          unitPrice: t('ordersManager.shoppingList.unitPrice'),
          purchasePrice: t('ordersManager.shoppingList.purchasePrice'),
          inventoryDecrease: t('ordersManager.shoppingList.inventoryAdjustLabel'),
          inventoryShortage: (count) =>
            t('ordersManager.shoppingList.inventoryShortage', { count }),
          notes: t('ordersManager.shoppingList.notes'),
        },
      ),
    );
    printWindow.document.close();
  }

  return (
    <>
      <div
        aria-label={t('adminWorkspace.orders.operations')}
        className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/[0.1] px-3 py-2.5"
      >
        <span className="me-auto hidden text-xs font-medium uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground sm:inline">
          {t('adminWorkspace.orders.operations')}
        </span>
        <SplitActionButton
          size="sm"
          label={t('adminWorkspace.orders.postConfirmed')}
          icon={<Package className="size-4" aria-hidden="true" />}
          primaryDisabled={!writable}
          onPrimaryClick={() => openConfirmedEcotrack('delivro')}
          options={[
            {
              key: 'post-selected-delivro',
              label: t('ordersManager.ecotrack.selectedAction'),
              disabled: !writable || selectedOrders.length === 0,
              onSelect: () => openEcotrackPreview('selected', 'delivro', selectedOrders),
            },
            {
              key: 'post-confirmed-emir',
              label: t('ordersManager.ecotrack.emirConfirmedAction'),
              disabled: !writable,
              onSelect: () => openConfirmedEcotrack('emir'),
            },
            {
              key: 'post-selected-emir',
              label: t('ordersManager.ecotrack.emirSelectedAction'),
              disabled: !writable || selectedOrders.length === 0,
              onSelect: () => openEcotrackPreview('selected', 'emir', selectedOrders),
            },
          ]}
        />
        <SplitActionButton
          size="sm"
          label={t('adminWorkspace.orders.postedShoppingList')}
          icon={<ShoppingBasket className="size-4" aria-hidden="true" />}
          onPrimaryClick={() => openStatusShoppingList('posted')}
          options={[
            {
              key: 'shopping-selected',
              label: t('ordersManager.shoppingList.selectedAction'),
              disabled: selectedOrders.length === 0,
              onSelect: () =>
                openShoppingListForOrders(
                  selectedOrders,
                  t('ordersManager.shoppingList.selectedTitle', {
                    count: selectedOrders.length,
                  }),
                ),
            },
            {
              key: 'shopping-confirmed',
              label: t('ordersManager.shoppingList.confirmedAction'),
              onSelect: () => openStatusShoppingList('confirmed'),
            },
            {
              key: 'shopping-dispatched',
              label: t('ordersManager.shoppingList.dispatchedAction'),
              onSelect: () => openStatusShoppingList('dispatched'),
            },
            {
              key: 'shopping-posted-confirmed',
              label: t('ordersManager.shoppingList.postedAndConfirmedAction'),
              onSelect: () => openStatusShoppingList('posted-and-confirmed'),
            },
          ]}
        />
      </div>

      {shoppingListOpen && !stockReviewOpen ? (
        <ShoppingListWorkspaceDialog
          open
          state={shoppingListState}
          pending={addShoppingListProductMutation.isPending}
          inventoryPending={inventoryBusy}
          saveStatus={shoppingListSaveStatus}
          onOpenChange={(open) => {
            if (!open && shoppingListState && shoppingListSaveTimeoutRef.current) {
              void saveShoppingListNow(shoppingListState).catch(() =>
                toast.error(t('ordersManager.shoppingList.saveError')),
              );
            }
            setShoppingListOpen(open);
          }}
          onPrint={printShoppingList}
          onSearchChange={(search) =>
            updateShoppingListState((current) => ({ ...current, search }))
          }
          onAddProduct={(product) => void addShoppingListProduct(product)}
          onReviewInventory={() => void openStockReview()}
          reviewInventoryLabel={shoppingInventoryReviewLabel(locale)}
          onReset={resetShoppingList}
          onRefresh={refreshShoppingList}
          onToggleItem={(draftId) =>
            updateShoppingListItems((items) =>
              items.map((item) =>
                item.draftId === draftId ? { ...item, checked: !item.checked } : item,
              ),
            )
          }
          onIncreaseQuantity={(draftId) =>
            updateShoppingListItems((items) =>
              items.map((item) =>
                item.draftId === draftId
                  ? recalculateShoppingListInventory(item, { quantity: item.quantity + 1 })
                  : item,
              ),
            )
          }
          onDecreaseQuantity={(draftId) =>
            updateShoppingListItems((items) =>
              items.map((item) =>
                item.draftId === draftId && item.quantity > 1
                  ? recalculateShoppingListInventory(item, { quantity: item.quantity - 1 })
                  : item,
              ),
            )
          }
          onIncreaseInventoryDecrease={(draftId) =>
            updateShoppingListItems((items) =>
              items.map((item) => {
                if (item.draftId !== draftId) return item;
                const maximum = Math.min(
                  Math.max(item.quantity - item.inventoryAppliedQuantity, 0),
                  item.inventoryQuantity ?? 0,
                );
                const next = Math.min(item.inventoryDecreaseQuantity + 1, maximum);
                return {
                  ...item,
                  inventoryDecreaseQuantity: next,
                  inventoryShortageQuantity: Math.max(
                    item.quantity - item.inventoryAppliedQuantity - next,
                    0,
                  ),
                };
              }),
            )
          }
          onDecreaseInventoryDecrease={(draftId) =>
            updateShoppingListItems((items) =>
              items.map((item) => {
                if (item.draftId !== draftId) return item;
                const next = Math.max(item.inventoryDecreaseQuantity - 1, 0);
                return {
                  ...item,
                  inventoryDecreaseQuantity: next,
                  inventoryShortageQuantity: Math.max(
                    item.quantity - item.inventoryAppliedQuantity - next,
                    0,
                  ),
                };
              }),
            )
          }
          onRemoveItem={(draftId) =>
            updateShoppingListItems((items) => items.filter((item) => item.draftId !== draftId))
          }
          onApplyAllInventoryChanges={() => void applyInventoryChanges(false)}
          onApplySelectedInventoryChanges={() => void applyInventoryChanges(true)}
        />
      ) : null}

      {shoppingListState ? (
        <ShoppingInventoryReviewDialog
          open={stockReviewOpen}
          onOpenChange={setStockReviewOpen}
          sourceMode={shoppingListState.sourceMode}
          orderIds={shoppingListState.orderIds}
          onReviewed={async () => {
            const response = await fetchShoppingListDraft(
              shoppingListState.sourceMode,
              shoppingListState.orderIds,
            );
            if (response.draft) {
              setShoppingListState(buildShoppingListStateFromDraft(response.draft));
              setShoppingListSaveStatus('saved');
            }
          }}
        />
      ) : null}

      {ecotrackPreviewState ? (
        <EcotrackPostingWorkspaceDialog
          state={ecotrackPreviewState}
          progress={ecotrackProgress}
          postingSummary={ecotrackSummary}
          onOpenChange={(open) => {
            if (!open && !ecotrackProgress) {
              setEcotrackPreviewState(null);
              setActiveEcotrackJobId(null);
            }
          }}
          onConfirm={() => void confirmEcotrackPosting()}
          onCancelJob={() => void cancelEcotrackMutation.mutateAsync()}
        />
      ) : null}
    </>
  );
}
