'use client';
import { ORDER_STATUS, type OrderRecord } from '../../../lib/orders';
import { type ShoppingListSourceMode } from '../../../lib/shopping-list-drafts';

type OrderJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { phase: string; current: number; total: number; percentage: number };
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
};

export type OrderJobResponse = { job: OrderJob | null };

export type InventoryApplyResponse = {
  ok: true;
  items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }>;
  skipped: Array<{ productId: number; reason: string }>;
};

export type StatusShoppingListMode = Exclude<ShoppingListSourceMode, 'selected'>;

export const shoppingListStatusConfig: Record<
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
