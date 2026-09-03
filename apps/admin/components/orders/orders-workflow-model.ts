import {
  legacyShoppingListGeneratedAt,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListOrderGroup,
} from '../../lib/shopping-list-drafts';

type EcotrackOrderPayload = {
  reference: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  code_postal?: string;
  commune: string;
  code_wilaya: string;
  montant: string;
  remarque?: string;
  produit?: string;
  type: '1';
  stop_desk: 0 | 1;
};

type EcotrackPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};

type EcotrackPreviewSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};

type EcotrackPreviewInvalidItem = {
  orderId: number;
  customerName: string;
  reason:
    | 'status_not_confirmed'
    | 'missing_phone'
    | 'missing_wilaya'
    | 'missing_commune'
    | 'invalid_commune'
    | 'missing_address'
    | 'missing_name';
  message: string;
};

export type EcotrackPreviewResponse = {
  totalRequested: number;
  eligible: EcotrackPreviewItem[];
  skipped: EcotrackPreviewSkipItem[];
  invalid: EcotrackPreviewInvalidItem[];
};

type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  message: string;
};

export type EcotrackPostingSummary = {
  totalRequested: number;
  eligible: number;
  created: number;
  skippedAlreadyPosted: number;
  invalid: number;
  failed: number;
  rateLimits: Array<Record<string, unknown>>;
  results: EcotrackPostingResultItem[];
};

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
