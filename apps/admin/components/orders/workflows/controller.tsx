'use client';
import { useEffect } from 'react';
import { ORDER_STATUS, parseNumericAmount, type OrderRecord } from '../../../lib/orders';
import {
  buildShoppingListInventoryPreview,
  reconcileShoppingListAllocations,
  type ShoppingListDraftItem,
} from '../../../lib/shopping-list-drafts';
import { toast } from '../../../lib/toast';
import type { ProductSearchItem } from '../order-products-editor';
import {
  buildShoppingListPrintHtml,
  buildShoppingListStateFromDraft,
  recalculateShoppingListInventory,
} from '../orders-shopping-list';
import type { EcotrackPostingSummary, ExportProgressState } from '../orders-workflow-model';
import { useShoppingListActions } from './shopping-list-actions';
import { useWorkflowQueries } from './use-workflow-queries';

export function useOrdersWorkflows({
  selectedOrders,
  writable,
  onOrdersChanged,
}: {
  selectedOrders: OrderRecord[];
  writable: boolean;
  onOrdersChanged: () => void | Promise<void>;
}) {
  const {
    ecotrackJob,
    lastEcotrackStatusRef,
    announcedJobIdsRef,
    t,
    shoppingListSaveTimeoutRef,
    shoppingListSaveSeqRef,
    setShoppingListSaveStatus,
    setShoppingListState,
    selectedShoppingListOrdersRef,
    setShoppingListOpen,
    shoppingListState,
    addShoppingListProductMutation,
    setStockReviewOpen,
    inventoryRequestRef,
    inventoryEdits,
    setInventoryBusy,
    applyInventoryMutation,
    previewEcotrackMutation,
    setActiveEcotrackJobId,
    setEcotrackPreviewState,
    ecotrackPreviewState,
    startEcotrackMutation,
    locale,
    shoppingListOpen,
    stockReviewOpen,
    inventoryBusy,
    shoppingListSaveStatus,
    cancelEcotrackMutation,
  } = useWorkflowQueries();

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
  }, [ecotrackJob, onOrdersChanged, t, announcedJobIdsRef, lastEcotrackStatusRef]);
  const {
    openStockReview,
    fetchOrdersByStatus,
    saveShoppingListNow,
    openShoppingListForOrders,
    openStatusShoppingList,
    updateShoppingListState,
    updateShoppingListItems,
    resetShoppingList,
    refreshShoppingList,
  } = useShoppingListActions({
    shoppingListSaveTimeoutRef,
    shoppingListSaveSeqRef,
    setShoppingListSaveStatus,
    setShoppingListState,
    t,
    selectedShoppingListOrdersRef,
    setShoppingListOpen,
    shoppingListState,
    setStockReviewOpen,
  });

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

  return {
    view: {
      t,
      writable,
      openConfirmedEcotrack,
      selectedOrders,
      openEcotrackPreview,
      openStatusShoppingList,
      openShoppingListForOrders,
      shoppingListOpen,
      stockReviewOpen,
      shoppingListState,
      addShoppingListProductMutation,
      inventoryBusy,
      shoppingListSaveStatus,
      shoppingListSaveTimeoutRef,
      saveShoppingListNow,
      setShoppingListOpen,
      printShoppingList,
      updateShoppingListState,
      addShoppingListProduct,
      openStockReview,
      locale,
      resetShoppingList,
      refreshShoppingList,
      updateShoppingListItems,
      applyInventoryChanges,
      setStockReviewOpen,
      setShoppingListState,
      setShoppingListSaveStatus,
      ecotrackPreviewState,
      ecotrackProgress,
      ecotrackSummary,
      setEcotrackPreviewState,
      setActiveEcotrackJobId,
      confirmEcotrackPosting,
      cancelEcotrackMutation,
    } as const,
    fallback: null,
  };
}
