import {
  legacyShoppingListGeneratedAt,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListOrderGroup,
} from '../../lib/shopping-list-drafts';

import type { EcotrackPreviewResult as EcotrackPreviewResponse } from '../../lib/ecotrack-posting';
export type {
  EcotrackPreviewResult as EcotrackPreviewResponse,
  EcotrackPostingSummary,
} from '../../lib/ecotrack-posting';

export type EcotrackPostingPreviewState = {
  mode: 'selected' | 'confirmed';
  provider: 'delivro' | 'emir';
  title: string;
  orderIds: number[];
  preview: EcotrackPreviewResponse;
} | null;

export type ExportProgressState = {
  phase: string;
  current: number;
  total: number;
} | null;

type ShoppingListBrandGroup = {
  brandId: number | null;
  brandName: string;
  products: ShoppingListDraftItem[];
};

export type ShoppingListGenerationGroup = {
  generatedAt: string;
  label: string;
  brandGroups: ShoppingListBrandGroup[];
  orders: ShoppingListOrderGroup[];
};

export type ShoppingListState =
  | (ShoppingListDraftPayload & {
      scopeKey: string;
      revision: number | null;
      search: string;
      updatedAt: string | null;
      updatedByName: string | null;
    })
  | null;

export type ShoppingListSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function formatGeneratedAt(value: string, locale: string, fallback: string) {
  if (value === legacyShoppingListGeneratedAt) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function groupShoppingListGenerations(
  state: NonNullable<ShoppingListState>,
  locale: string,
  fallbackLabel: string,
) {
  const groups = new Map<
    string,
    { products: ShoppingListDraftItem[]; orders: ShoppingListOrderGroup[] }
  >();

  for (const product of state.draftItems) {
    const generatedAt = product.generatedAt || legacyShoppingListGeneratedAt;
    const group = groups.get(generatedAt) ?? { products: [], orders: [] };
    group.products.push(product);
    groups.set(generatedAt, group);
  }

  for (const order of state.orders) {
    const generatedAt = order.generatedAt || legacyShoppingListGeneratedAt;
    const group = groups.get(generatedAt) ?? { products: [], orders: [] };
    group.orders.push(order);
    groups.set(generatedAt, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === legacyShoppingListGeneratedAt) return 1;
      if (right === legacyShoppingListGeneratedAt) return -1;
      return new Date(right).getTime() - new Date(left).getTime();
    })
    .map(([generatedAt, group]): ShoppingListGenerationGroup => {
      const brandGroupsMap = new Map<string, ShoppingListBrandGroup>();
      for (const product of group.products) {
        const key = `${product.brandId ?? 'none'}:${product.brandName}`;
        const brandGroup = brandGroupsMap.get(key) ?? {
          brandId: product.brandId,
          brandName: product.brandName,
          products: [],
        };
        brandGroup.products.push(product);
        brandGroupsMap.set(key, brandGroup);
      }

      return {
        generatedAt,
        label: formatGeneratedAt(generatedAt, locale, fallbackLabel),
        brandGroups: [...brandGroupsMap.values()]
          .map((brandGroup) => ({
            ...brandGroup,
            products: [...brandGroup.products].sort((left, right) =>
              left.title.localeCompare(right.title),
            ),
          }))
          .sort((left, right) => left.brandName.localeCompare(right.brandName)),
        orders: [...group.orders].sort((left, right) => left.orderId - right.orderId),
      };
    });
}
