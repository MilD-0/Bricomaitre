'use client';

/* eslint-disable @next/next/no-img-element -- Operational product thumbnails can use legacy arbitrary origins. */

import { useQuery } from '@tanstack/react-query';
import { Package, Printer } from 'lucide-react';
import { useDeferredValue } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { requestJson as request } from '../../lib/admin-api';
import { parseNumericAmount } from '../../lib/orders';
import { cn } from '../../lib/utils';
import { SearchField } from '../search-field';
import { SplitActionButton } from '../split-action-button';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import type { ProductSearchItem, ProductSearchResponse } from './order-products-editor';
import {
  groupShoppingListGenerations,
  type EcotrackPostingPreviewState,
  type EcotrackPostingSummary,
  type ExportProgressState,
  type ShoppingListSaveStatus,
  type ShoppingListState,
} from './orders-workflow-model';

function formatMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

function OperationalThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
      <Package className="size-4" aria-hidden="true" />
    </span>
  );
}

export function ShoppingListWorkspaceDialog({
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
  onReviewInventory,
  reviewInventoryLabel,
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
  onReviewInventory?: () => void;
  reviewInventoryLabel?: string;
  onApplyAllInventoryChanges: () => void;
  onApplySelectedInventoryChanges: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const deferredSearch = useDeferredValue(state?.search ?? '');
  const searchQuery = useQuery({
    queryKey: ['selected-shopping-list-products-search', deferredSearch],
    enabled: open && deferredSearch.trim().length > 0,
    queryFn: async () => {
      const response = await request<ProductSearchResponse>(
        `/api/orders/product-options?limit=8&search=${encodeURIComponent(deferredSearch)}`,
      );
      return response.items.map((item) => ({
        ...item,
        price: parseNumericAmount(item.price),
      }));
    },
  });
  const generations = state
    ? groupShoppingListGenerations(
        state,
        locale,
        t('ordersManager.shoppingList.previousGeneration'),
      )
    : [];
  const saveLabel =
    saveStatus === 'saving'
      ? t('ordersManager.shoppingList.saving')
      : saveStatus === 'saved'
        ? t('ordersManager.shoppingList.saved')
        : saveStatus === 'error'
          ? t('ordersManager.shoppingList.saveError')
          : state?.updatedByName
            ? t('ordersManager.shoppingList.lastSavedBy', { name: state.updatedByName })
            : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none flex-col overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-[var(--shape-radius-overlay)]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <DialogTitle>{state?.title ?? t('ordersManager.shoppingList.title')}</DialogTitle>
            {saveLabel ? (
              <span
                className={cn(
                  'text-xs text-muted-foreground',
                  saveStatus === 'error' && 'text-destructive',
                )}
              >
                {saveLabel}
              </span>
            ) : null}
          </div>
        </DialogHeader>

        {state ? (
          <fieldset disabled={inventoryPending} className="contents">
            <div className="shrink-0 border-b border-border/60 px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <SplitActionButton
                  size="sm"
                  label={t('ordersManager.shoppingList.print')}
                  icon={<Printer className="size-4" aria-hidden="true" />}
                  onPrimaryClick={onPrint}
                  options={[
                    ...(onReviewInventory
                      ? [
                          {
                            key: 'review-stock',
                            disabled: inventoryPending,
                            label: reviewInventoryLabel ?? '',
                            onSelect: onReviewInventory,
                          },
                        ]
                      : []),
                    {
                      key: 'refresh',
                      disabled: inventoryPending,
                      label: t('ordersManager.shoppingList.refresh'),
                      onSelect: onRefresh,
                    },
                    {
                      key: 'reset',
                      disabled: inventoryPending,
                      label: t('ordersManager.shoppingList.reset'),
                      onSelect: onReset,
                    },
                    {
                      key: 'apply-selected',
                      label: t('ordersManager.shoppingList.applySelectedInventoryChanges'),
                      disabled: inventoryPending,
                      onSelect: onApplySelectedInventoryChanges,
                    },
                    {
                      key: 'apply-all',
                      label: t('ordersManager.shoppingList.acceptAllInventoryChanges'),
                      disabled: inventoryPending,
                      onSelect: onApplyAllInventoryChanges,
                    },
                  ]}
                />
              </div>
              <div className="relative mt-3 max-w-xl">
                <SearchField
                  value={state.search}
                  onChange={onSearchChange}
                  placeholder={t('ordersManager.shoppingList.addProductPlaceholder')}
                />
                {state.search.trim() ? (
                  <div className="absolute inset-x-0 top-full z-20 mt-1 divide-y divide-border/55 overflow-hidden rounded-md border border-border/70 bg-popover shadow-lg">
                    {searchQuery.isFetching ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        {t('ordersManager.products.searchLoading')}
                      </p>
                    ) : null}
                    {searchQuery.data?.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 px-3 py-2.5">
                        <OperationalThumbnail src={product.images[0] ?? null} alt={product.title} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{product.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(locale, parseNumericAmount(product.price))}
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
                      </div>
                    ))}
                    {!searchQuery.isFetching && searchQuery.data?.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        {t('ordersManager.products.searchEmpty')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
              <section className="min-w-0 lg:overflow-y-auto lg:border-e lg:border-border/60">
                <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
                  <h3 className="text-sm font-semibold">
                    {t('ordersManager.shoppingList.consolidatedTitle')}
                  </h3>
                </header>
                {generations.map((generation) => (
                  <div
                    key={`products-${generation.generatedAt}`}
                    className="border-b border-border/60"
                  >
                    <p className="px-4 py-2 text-xs font-medium text-muted-foreground">
                      {t('ordersManager.shoppingList.generatedAt', { date: generation.label })}
                    </p>
                    {generation.brandGroups.map((group) => (
                      <div key={`${generation.generatedAt}-${group.brandName}`}>
                        <p className="border-y border-border/45 bg-muted/20 px-4 py-2 text-xs font-semibold">
                          {group.brandName}
                        </p>
                        <div className="divide-y divide-border/45">
                          {group.products.map((product) => (
                            <div
                              key={product.draftId}
                              className={cn(
                                'flex items-start gap-3 px-4 py-3',
                                product.checked && 'text-muted-foreground',
                              )}
                            >
                              <Checkbox
                                checked={product.checked}
                                aria-label={t('ordersManager.shoppingList.toggleItem', {
                                  title: product.title,
                                })}
                                onChange={() => onToggleItem(product.draftId)}
                              />
                              <OperationalThumbnail
                                src={product.thumbnailUrl}
                                alt={product.title}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    'text-sm font-medium',
                                    product.checked && 'line-through',
                                  )}
                                >
                                  {product.title}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {t('ordersManager.shoppingList.purchasePrice')}:{' '}
                                  {product.purchasePrice == null
                                    ? '—'
                                    : formatMoney(locale, product.purchasePrice)}
                                  {product.notes.length > 0
                                    ? ` · ${product.notes.join(' · ')}`
                                    : ''}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="size-8 px-0"
                                    aria-label={t('ordersManager.shoppingList.decreaseQuantity', {
                                      title: product.title,
                                    })}
                                    onClick={() => onDecreaseQuantity(product.draftId)}
                                  >
                                    −
                                  </Button>
                                  <span className="min-w-7 text-center text-sm font-semibold tabular-nums">
                                    {product.quantity}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="size-8 px-0"
                                    aria-label={t('ordersManager.shoppingList.increaseQuantity', {
                                      title: product.title,
                                    })}
                                    onClick={() => onIncreaseQuantity(product.draftId)}
                                  >
                                    +
                                  </Button>
                                  {product.inventoryShortageQuantity > 0 ? (
                                    <span className="text-xs font-medium text-destructive">
                                      {t('ordersManager.shoppingList.inventoryShortage', {
                                        count: product.inventoryShortageQuantity,
                                      })}
                                    </span>
                                  ) : null}
                                  {product.inventoryActionEligible ? (
                                    <>
                                      <span className="ms-2 text-xs text-muted-foreground">
                                        {t('ordersManager.shoppingList.inventoryAdjustLabel')}
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="size-8 px-0"
                                        aria-label={t(
                                          'ordersManager.shoppingList.decreaseInventoryDelta',
                                          { title: product.title },
                                        )}
                                        onClick={() => onDecreaseInventoryDecrease(product.draftId)}
                                      >
                                        −
                                      </Button>
                                      <span className="min-w-6 text-center text-xs tabular-nums">
                                        {product.inventoryDecreaseQuantity}
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="size-8 px-0"
                                        aria-label={t(
                                          'ordersManager.shoppingList.increaseInventoryDelta',
                                          { title: product.title },
                                        )}
                                        onClick={() => onIncreaseInventoryDecrease(product.draftId)}
                                      >
                                        +
                                      </Button>
                                    </>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="ms-auto text-destructive"
                                    onClick={() => onRemoveItem(product.draftId)}
                                  >
                                    {t('actions.delete')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>

              <section className="min-w-0 lg:overflow-y-auto">
                <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
                  <h3 className="text-sm font-semibold">
                    {t('ordersManager.shoppingList.ordersTitle')}
                  </h3>
                </header>
                {generations.map((generation) => (
                  <div key={`orders-${generation.generatedAt}`}>
                    {generation.orders.map((order) => (
                      <div key={order.orderId} className="border-b border-border/60 px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium">
                            #{order.orderId} · {order.customerName}
                          </p>
                          <span className="text-xs text-muted-foreground">{generation.label}</span>
                        </div>
                        {order.note ? (
                          <p className="mt-1 text-sm text-muted-foreground">{order.note}</p>
                        ) : null}
                        <div className="mt-2 divide-y divide-border/40">
                          {order.products.map((product, index) => (
                            <div
                              key={`${order.orderId}-${index}`}
                              className="flex items-center gap-3 py-2 text-sm"
                            >
                              <OperationalThumbnail
                                src={product.thumbnailUrl}
                                alt={product.title}
                              />
                              <div className="min-w-0">
                                <p className="truncate">
                                  {product.title} × {product.quantity}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {product.brandName} ·{' '}
                                  {product.purchasePrice == null
                                    ? '—'
                                    : formatMoney(locale, product.purchasePrice)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            </div>
          </fieldset>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EcotrackPostingWorkspaceDialog({
  state,
  progress,
  postingSummary,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: EcotrackPostingPreviewState;
  progress: ExportProgressState;
  postingSummary: EcotrackPostingSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancelJob: () => void;
}) {
  const t = useTranslations();
  const preview = state?.preview ?? null;
  const pending = progress !== null;

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none flex-col overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[var(--shape-radius-overlay)]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle>{state?.title ?? t('ordersManager.ecotrack.previewTitle')}</DialogTitle>
        </DialogHeader>
        {preview ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {progress ? (
              <div className="border-b border-border/60 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{t(`ordersManager.ecotrack.progress.${progress.phase}`)}</span>
                  <span className="tabular-nums">
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{
                      width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-2 border-b border-border/60 sm:grid-cols-4">
              {[
                [t('ordersManager.ecotrack.summary.totalRequested'), preview.totalRequested],
                [t('ordersManager.ecotrack.summary.eligible'), preview.eligible.length],
                [t('ordersManager.ecotrack.summary.skipped'), preview.skipped.length],
                [t('ordersManager.ecotrack.summary.invalid'), preview.invalid.length],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="border-e border-border/50 px-4 py-3 last:border-e-0"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h3 className="border-b border-border/50 bg-muted/15 px-4 py-2.5 text-sm font-semibold">
                {t('ordersManager.ecotrack.previewEligible')}
              </h3>
              {preview.eligible.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">
                  {t('ordersManager.ecotrack.emptyEligible')}
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {preview.eligible.map((item) => (
                    <div key={item.orderId} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">
                          #{item.orderId} · {item.customerName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.destination} · {item.amount}
                        </p>
                      </div>
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">
                          {t('adminWorkspace.orders.payloadDetails')}
                        </summary>
                        <pre className="mt-2 overflow-x-auto border-s border-border/60 ps-3">
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {preview.skipped.length > 0 || preview.invalid.length > 0 ? (
              <section className="grid border-t border-border/60 md:grid-cols-2">
                <div className="border-border/60 md:border-e">
                  <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                    {t('ordersManager.ecotrack.previewSkipped')}
                  </h3>
                  {preview.skipped.map((item) => (
                    <p key={item.orderId} className="border-b border-border/40 px-4 py-3 text-sm">
                      #{item.orderId} · {item.customerName} ·{' '}
                      <span className="text-muted-foreground">
                        {t(`ordersManager.ecotrack.reasons.${item.reason}`)}
                      </span>
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                    {t('ordersManager.ecotrack.previewInvalid')}
                  </h3>
                  {preview.invalid.map((item) => (
                    <p key={item.orderId} className="border-b border-border/40 px-4 py-3 text-sm">
                      #{item.orderId} · {item.customerName} ·{' '}
                      <span className="text-destructive">{item.message}</span>
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {postingSummary ? (
              <section className="border-t border-border/60">
                <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                  {t('ordersManager.ecotrack.resultTitle')}
                </h3>
                <div className="divide-y divide-border/40">
                  {(Array.isArray(postingSummary.results) ? postingSummary.results : []).map(
                    (item) => (
                      <p key={`${item.reference}-${item.status}`} className="px-4 py-3 text-sm">
                        #{item.orderId} · {item.status}
                        {item.tracking ? ` · ${item.tracking}` : ''}
                        {item.message ? ` · ${item.message}` : ''}
                      </p>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelJob}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={pending || !state || preview?.eligible.length === 0}
            onClick={onConfirm}
          >
            {t('ordersManager.ecotrack.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
