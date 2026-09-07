'use client';
import { requestJson as request } from '../../../lib/admin-api';
import type { OrdersResponse } from '../../../lib/order-admin-contracts';
import { type OrderRecord } from '../../../lib/orders';
import {
  reconcileShoppingListAllocations,
  type ShoppingListDraftItem,
} from '../../../lib/shopping-list-drafts';
import { toast } from '../../../lib/toast';
import {
  buildMergedShoppingListState,
  buildShoppingListStateFromDraft,
  fetchShoppingListDraft,
  resetShoppingListDraft,
  saveShoppingListDraft,
} from '../orders-shopping-list';
import type { ShoppingListState } from '../orders-workflow-model';
import { shoppingListStatusConfig, type StatusShoppingListMode } from './contract';
import { useWorkflowQueries } from './use-workflow-queries';
export function useShoppingListActions({
  shoppingListSaveTimeoutRef,
  shoppingListSaveSeqRef,
  setShoppingListSaveStatus,
  setShoppingListState,
  t,
  selectedShoppingListOrdersRef,
  setShoppingListOpen,
  shoppingListState,
  setStockReviewOpen,
}: Pick<
  ReturnType<typeof useWorkflowQueries>,
  | 'shoppingListSaveTimeoutRef'
  | 'shoppingListSaveSeqRef'
  | 'setShoppingListSaveStatus'
  | 'setShoppingListState'
  | 't'
  | 'selectedShoppingListOrdersRef'
  | 'setShoppingListOpen'
  | 'shoppingListState'
  | 'setStockReviewOpen'
>) {
  async function openStockReview() {
    if (!shoppingListState) return;
    try {
      await saveShoppingListNow(shoppingListState);
      setStockReviewOpen(true);
    } catch {
      toast.error(t('ordersManager.shoppingList.saveError'));
    }
  }
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
  return {
    openStockReview,
    fetchOrdersByStatus,
    fetchOrdersForShoppingListSource,
    saveShoppingListNow,
    scheduleShoppingListSave,
    openShoppingListForOrders,
    openStatusShoppingList,
    updateShoppingListState,
    updateShoppingListItems,
    resetShoppingList,
    refreshShoppingList,
  };
}
