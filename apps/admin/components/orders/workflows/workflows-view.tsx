'use client';
import { Package, ShoppingBasket } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { SplitActionButton } from '../../split-action-button';
import {
  buildShoppingListStateFromDraft,
  fetchShoppingListDraft,
  recalculateShoppingListInventory,
} from '../orders-shopping-list';
import {
  EcotrackPostingWorkspaceDialog,
  ShoppingListWorkspaceDialog,
} from '../orders-workflow-dialogs';
import {
  ShoppingInventoryReviewDialog,
  shoppingInventoryReviewLabel,
} from '../shopping-inventory-review';
import { type useOrdersWorkflows } from './use-workflows';

export function OrdersWorkflowsView({
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
}: NonNullable<ReturnType<typeof useOrdersWorkflows>['view']>) {
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
