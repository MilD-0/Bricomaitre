'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  type InventoryListResponse,
  type InventoryOrderScanItem,
  type InventoryRow,
} from '../../lib/inventory';
import { type SortRule } from '../../lib/multi-sort';
import { type QuerySnapshot } from '../../lib/query-cache';

type MutationMessages = {
  loading: string;
  success: string;
  error: string;
};

export type MutationContext<T> = {
  messages: MutationMessages;
  snapshot: QuerySnapshot<T>;
  toastId: string;
};

export type InventoryMutationVariables = {
  id: number;
  payload: { delta?: number; inStock?: boolean; barcode?: string | null };
  messages: MutationMessages;
};

export type BarcodeDialogState = {
  open: boolean;
  item: InventoryRow | null;
};

export type ScanBarcodeState = {
  open: boolean;
  item: InventoryRow | null;
};

type ScanOrderDraftItem = InventoryOrderScanItem & {
  selected: boolean;
  addQuantity: number;
};

export type ScanOrderState = {
  open: boolean;
  order: { id: number; fullName: string } | null;
  items: ScanOrderDraftItem[];
};

export type InventorySortKey = 'title' | 'inventoryQuantity' | 'inStock';

export type InventorySortRule = SortRule<InventorySortKey>;

export const defaultInventorySort: InventorySortRule[] = [{ key: 'title', direction: 'asc' }];

export function buildMessages(
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

export function updateInventoryLists(
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
