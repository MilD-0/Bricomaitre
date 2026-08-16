'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails can come from legacy arbitrary origins and are not page-critical media. */

import { useQuery } from '@tanstack/react-query';
import { Package, Printer, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import { parseNumericAmount } from '../../lib/orders';
import { cn } from '../../lib/utils';
import {
  legacyShoppingListGeneratedAt,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
  type ShoppingListOrderGroup,
} from '../../lib/shopping-list-drafts';
import { type ProductSearchItem, type ProductSearchResponse } from './order-products-editor';
import { SearchField } from '../search-field';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}
type ShoppingListBrandGroup = {
  brandId: number | null;
  brandName: string;
  products: ShoppingListDraftItem[];
};
type ShoppingListGenerationGroup = {
  generatedAt: string;
  label: string;
  brandGroups: ShoppingListBrandGroup[];
  orders: ShoppingListOrderGroup[];
};
export type ShoppingListState =
  | (ShoppingListDraftPayload & {
      scopeKey: string;
      search: string;
      updatedAt: string | null;
      updatedByName: string | null;
    })
  | null;
export type ShoppingListSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function formatShoppingListGeneratedAt(value: string, locale: string, fallback: string) {
  if (value === legacyShoppingListGeneratedAt) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

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
      if (left === legacyShoppingListGeneratedAt) {
        return 1;
      }
      if (right === legacyShoppingListGeneratedAt) {
        return -1;
      }
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
        label: formatShoppingListGeneratedAt(generatedAt, locale, fallbackLabel),
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

function ProductThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-14 rounded-xl object-cover" />
  ) : (
    <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Package />
    </div>
  );
}

export function ShoppingListDialog({
  open,
  state,
  pending,
  inventoryPending,
  saveStatus,
  onOpenChange,
  onPrint,
  onSearchChange,
  onAddProduct,
  onReset,
  onRefresh,
  onToggleItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onIncreaseInventoryDecrease,
  onDecreaseInventoryDecrease,
  onRemoveItem,
  onApplyAllInventoryChanges,
  onApplySelectedInventoryChanges,
}: {
  open: boolean;
  state: ShoppingListState;
  pending: boolean;
  inventoryPending: boolean;
  saveStatus: ShoppingListSaveStatus;
  onOpenChange: (open: boolean) => void;
  onPrint: () => void;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onReset: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onToggleItem: (draftId: string) => void;
  onIncreaseQuantity: (draftId: string) => void;
  onDecreaseQuantity: (draftId: string) => void;
  onIncreaseInventoryDecrease: (draftId: string) => void;
  onDecreaseInventoryDecrease: (draftId: string) => void;
  onRemoveItem: (draftId: string) => void;
  onApplyAllInventoryChanges: () => void;
  onApplySelectedInventoryChanges: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const deferredSearch = useDeferredValue(state?.search ?? '');
  const searchQuery = useQuery({
    queryKey: ['shopping-list-products-search', deferredSearch],
    enabled: open && deferredSearch.trim().length > 0,
    queryFn: async () => {
      const response = await request<ProductSearchResponse>(
        `/api/products?page=1&limit=8&search=${encodeURIComponent(deferredSearch)}`,
      );

      return response.items.map((item) => ({
        ...item,
        price: parseNumericAmount(item.price),
      }));
    },
  });
  const generationGroups = useMemo(() => {
    if (!state) {
      return [];
    }

    return groupShoppingListGenerations(
      state,
      locale,
      t('ordersManager.shoppingList.previousGeneration'),
    );
  }, [locale, state, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{state?.title ?? t('ordersManager.shoppingList.title')}</DialogTitle>
          <DialogDescription className="flex flex-col gap-1">
            <span>{t('ordersManager.shoppingList.description')}</span>
            {state ? (
              <span
                className={cn(
                  'text-xs',
                  saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {saveStatus === 'saving' ? t('ordersManager.shoppingList.saving') : null}
                {saveStatus === 'saved' ? t('ordersManager.shoppingList.saved') : null}
                {saveStatus === 'error' ? t('ordersManager.shoppingList.saveError') : null}
                {saveStatus === 'idle' && state.updatedByName
                  ? t('ordersManager.shoppingList.lastSavedBy', { name: state.updatedByName })
                  : null}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 p-4">
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={onPrint}>
                    <Printer data-icon="inline-start" />
                    {t('ordersManager.shoppingList.print')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onReset()}>
                    {t('ordersManager.shoppingList.reset')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onRefresh()}>
                    {t('ordersManager.shoppingList.refresh')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={inventoryPending}
                    onClick={onApplyAllInventoryChanges}
                  >
                    {t('ordersManager.shoppingList.acceptAllInventoryChanges')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={inventoryPending}
                    onClick={onApplySelectedInventoryChanges}
                  >
                    {t('ordersManager.shoppingList.applySelectedInventoryChanges')}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    {t('ordersManager.shoppingList.addProductTitle')}
                  </p>
                  <SearchField
                    value={state.search}
                    onChange={onSearchChange}
                    placeholder={t('ordersManager.shoppingList.addProductPlaceholder')}
                  />
                  {state.search.trim().length ? (
                    <div className="flex flex-col gap-3">
                      {searchQuery.isFetching ? (
                        <p className="text-sm text-muted-foreground">
                          {t('ordersManager.products.searchLoading')}
                        </p>
                      ) : null}
                      {!searchQuery.isFetching && searchQuery.data?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('ordersManager.products.searchEmpty')}
                        </p>
                      ) : null}
                      {searchQuery.data?.map((product) => (
                        <Card
                          key={product.id}
                          className="flex items-center gap-3 rounded-2xl border border-border/70 p-3"
                        >
                          <ProductThumbnail src={product.images[0] ?? null} alt={product.title} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{product.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {t('ordersManager.products.unitPrice')}:{' '}
                              {formatCurrency(locale, parseNumericAmount(product.price))}
                              {product.purchasePrice == null ? null : (
                                <>
                                  {' '}
                                  · {t('ordersManager.shoppingList.purchasePrice')}:{' '}
                                  {formatCurrency(
                                    locale,
                                    parseNumericAmount(product.purchasePrice),
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => onAddProduct(product)}
                          >
                            {t('ordersManager.shoppingList.addProductAction')}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {generationGroups.map((generation) => (
                  <div
                    key={`products-${generation.generatedAt}`}
                    className="rounded-xl border border-border/70 p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {t('ordersManager.shoppingList.generatedAt', { date: generation.label })}
                    </p>
                    <div className="mt-3 flex flex-col gap-4">
                      {generation.brandGroups.map((group) => (
                        <div
                          key={`${generation.generatedAt}-${group.brandId ?? 'none'}-${group.brandName}`}
                          className="rounded-xl border border-border/70 p-3"
                        >
                          <p className="font-medium">{group.brandName}</p>
                          <div className="mt-3 flex flex-col gap-2">
                            {group.products.map((product) => (
                              <div
                                key={product.draftId}
                                className={cn(
                                  'rounded-lg border p-2 text-sm',
                                  product.checked
                                    ? 'border-border/70 bg-muted/30 text-muted-foreground line-through'
                                    : product.inventoryQuantity != null &&
                                        product.inventoryQuantity > 0
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                      : 'border-border/70 bg-muted/30',
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={product.checked}
                                    onChange={() => onToggleItem(product.draftId)}
                                    aria-label={t('ordersManager.shoppingList.toggleItem', {
                                      title: product.title,
                                    })}
                                  />
                                  {product.thumbnailUrl ? (
                                    <img
                                      src={product.thumbnailUrl}
                                      alt={product.title}
                                      className="size-10 rounded-md border border-border/70 object-cover"
                                    />
                                  ) : null}
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">
                                      {product.title} x{product.quantity}
                                    </p>
                                    {product.unitPrice == null ? null : (
                                      <p className="text-xs text-muted-foreground">
                                        {t('ordersManager.shoppingList.unitPrice')}:{' '}
                                        {formatCurrency(locale, product.unitPrice)}
                                        {product.purchasePrice == null ? null : (
                                          <>
                                            {' '}
                                            · {t('ordersManager.shoppingList.purchasePrice')}:{' '}
                                            {formatCurrency(locale, product.purchasePrice)}
                                          </>
                                        )}
                                      </p>
                                    )}
                                    {product.notes.length ? (
                                      <p className="text-muted-foreground">
                                        {t('ordersManager.shoppingList.notes')}:{' '}
                                        {product.notes.join(' | ')}
                                      </p>
                                    ) : null}
                                    {product.isCustom ? (
                                      <p className="text-xs text-muted-foreground">
                                        {t('ordersManager.shoppingList.customItem')}
                                      </p>
                                    ) : null}
                                    {product.inventoryActionEligible ? (
                                      <p className="text-xs font-medium text-emerald-700">
                                        {t('ordersManager.shoppingList.inventoryDecreasePreview', {
                                          count: product.inventoryDecreaseQuantity,
                                        })}
                                        {product.inventoryShortageQuantity > 0
                                          ? ` • ${t('ordersManager.shoppingList.inventoryShortage', { count: product.inventoryShortageQuantity })}`
                                          : ''}
                                      </p>
                                    ) : null}
                                    {product.inventoryAppliedQuantity > 0 ? (
                                      <p className="text-xs text-muted-foreground">
                                        {t('ordersManager.shoppingList.inventoryApplied', {
                                          count: product.inventoryAppliedQuantity,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending || product.quantity <= 1}
                                      onClick={() => onDecreaseQuantity(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.decreaseQuantity', {
                                        title: product.title,
                                      })}
                                    >
                                      -
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending}
                                      onClick={() => onIncreaseQuantity(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.increaseQuantity', {
                                        title: product.title,
                                      })}
                                    >
                                      +
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={pending}
                                      onClick={() => onRemoveItem(product.draftId)}
                                      aria-label={t('ordersManager.shoppingList.removeItem', {
                                        title: product.title,
                                      })}
                                    >
                                      <X />
                                    </Button>
                                  </div>
                                </div>
                                {product.productId != null ? (
                                  <div className="mt-3 flex items-center gap-2 pl-7">
                                    <span className="text-xs text-muted-foreground">
                                      {t('ordersManager.shoppingList.inventoryAdjustLabel')}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        inventoryPending || product.inventoryDecreaseQuantity <= 0
                                      }
                                      onClick={() => onDecreaseInventoryDecrease(product.draftId)}
                                      aria-label={t(
                                        'ordersManager.shoppingList.decreaseInventoryDelta',
                                        { title: product.title },
                                      )}
                                    >
                                      -1
                                    </Button>
                                    <span className="min-w-10 text-center text-sm font-medium">
                                      {product.inventoryDecreaseQuantity}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        inventoryPending ||
                                        product.inventoryDecreaseQuantity >=
                                          Math.min(product.quantity, product.inventoryQuantity ?? 0)
                                      }
                                      onClick={() => onIncreaseInventoryDecrease(product.draftId)}
                                      aria-label={t(
                                        'ordersManager.shoppingList.increaseInventoryDelta',
                                        { title: product.title },
                                      )}
                                    >
                                      +1
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <div className="flex flex-col gap-4">
                {generationGroups.map((generation) => (
                  <div
                    key={`orders-${generation.generatedAt}`}
                    className="rounded-xl border border-border/70 p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {t('ordersManager.shoppingList.generatedAt', { date: generation.label })}
                    </p>
                    <div className="mt-3 flex flex-col gap-3">
                      {generation.orders.map((order) => (
                        <div key={order.orderId} className="rounded-xl border border-border/70 p-3">
                          <p className="font-medium">
                            #{order.orderId} {order.customerName}
                          </p>
                          {order.note ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {t('ordersManager.shoppingList.notes')}: {order.note}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-col gap-2">
                            {order.products.map((product, index) => (
                              <div
                                key={`${order.orderId}-${index}`}
                                className="flex items-center gap-3 text-sm"
                              >
                                {product.thumbnailUrl ? (
                                  <img
                                    src={product.thumbnailUrl}
                                    alt={product.title}
                                    className="size-8 rounded-md border border-border/70 object-cover"
                                  />
                                ) : null}
                                <div>
                                  <p>
                                    {product.brandName} / {product.title} x{product.quantity}
                                  </p>
                                  {product.unitPrice == null ? null : (
                                    <p className="text-xs text-muted-foreground">
                                      {t('ordersManager.shoppingList.unitPrice')}:{' '}
                                      {formatCurrency(locale, product.unitPrice)}
                                      {product.purchasePrice == null ? null : (
                                        <>
                                          {' '}
                                          · {t('ordersManager.shoppingList.purchasePrice')}:{' '}
                                          {formatCurrency(locale, product.purchasePrice)}
                                        </>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
