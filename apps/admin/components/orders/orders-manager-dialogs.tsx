'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import {
  getDeliveryTypeLabelKey,
  getOrderStatusLabelKey,
  type OrderRecord,
} from '../../lib/orders';
import {
  buildOrderPhoneTelHref,
  formatOrderPhoneForDisplay,
  formatOrderRegionLabel,
} from '../../lib/order-presentation';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  areCartProductsEqual,
  OrderProductsEditor,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
} from './order-products-editor';
import { OrderProductsPreview } from './order-products-preview';

export type ProductsDialogState = {
  order: OrderRecord;
  items: EditableOrderProduct[];
  search: string;
} | null;

type OrderDetailResponse = { ok: true; item: OrderRecord };

function formatOrderStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: OrderRecord['confirmed'],
) {
  return t(`ordersManager.status.${getOrderStatusLabelKey(status)}`);
}

export function DeleteOrderDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t('actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderDetailsDialog({
  order,
  onOpenChange,
  hoveredProductKey,
  onHoverChange,
  formatMoney,
  catalog,
}: {
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
  hoveredProductKey: string | null;
  onHoverChange: Dispatch<SetStateAction<string | null>>;
  formatMoney: (value: number) => string;
  catalog?: EcotrackCatalogResponse;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['order-detail', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  const detail = detailQuery.data?.item ?? order;

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.details.title')}</DialogTitle>
          <DialogDescription>{detail?.fullName}</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.client')}
              </p>
              <p className="mt-2 font-medium">{detail.fullName}</p>
              {buildOrderPhoneTelHref(detail.phoneNumber1) ? (
                <p className="text-sm text-muted-foreground">
                  <a
                    className="underline-offset-4 hover:underline"
                    href={buildOrderPhoneTelHref(detail.phoneNumber1) ?? undefined}
                  >
                    {formatOrderPhoneForDisplay(detail.phoneNumber1)}
                  </a>
                </p>
              ) : null}
              {buildOrderPhoneTelHref(detail.phoneNumber2) ? (
                <p className="text-sm text-muted-foreground">
                  <a
                    className="underline-offset-4 hover:underline"
                    href={buildOrderPhoneTelHref(detail.phoneNumber2) ?? undefined}
                  >
                    {formatOrderPhoneForDisplay(detail.phoneNumber2)}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.date')}
              </p>
              <p className="mt-2 text-sm">{detail.createdAt}</p>
              <p className="text-sm text-muted-foreground">
                {formatOrderStatusLabel(t, detail.confirmed)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.products')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <OrderProductsPreview
                  orderId={detail.id}
                  products={detail.orderProducts}
                  emptyLabel={t('ordersManager.products.empty')}
                  hoveredProductKey={hoveredProductKey}
                  onHoverChange={onHoverChange}
                  formatMoney={formatMoney}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.address')}
              </p>
              <p className="mt-2 text-sm">
                {t(`ordersManager.delivery.${getDeliveryTypeLabelKey(detail.delivery)}`)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatOrderRegionLabel(
                  catalog,
                  detail.state,
                  detail.city,
                  t('ordersManager.placeholders.region'),
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {detail.homeAddress || t('ordersManager.placeholders.street')}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('ordersManager.columns.notes')}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.note || t('ordersManager.notes.empty')}
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function OrderProductsDialog({
  state,
  pending,
  onOpenChange,
  onSearchChange,
  onAddProduct,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveProduct,
  onSave,
}: {
  state: ProductsDialogState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onIncreaseQuantity: (rawValue: string) => void;
  onDecreaseQuantity: (rawValue: string) => void;
  onRemoveProduct: (rawValue: string) => void;
  onSave: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const selectedProducts = state ? summarizeEditableProducts(state.items) : [];
  const productSubtotal = selectedProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const totalAmount = productSubtotal + (state?.order.deliveryFee ?? 0);
  const hasChanges = state
    ? !areCartProductsEqual(
        state.items.map((item) => item.rawValue),
        state.order.cartProducts,
      )
    : false;
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'DZD',
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.products.title')}</DialogTitle>
          <DialogDescription>{state?.order.fullName}</DialogDescription>
        </DialogHeader>
        {state ? (
          <OrderProductsEditor
            customerName={state.order.fullName}
            items={state.items}
            search={state.search}
            onSearchChange={onSearchChange}
            onAddProduct={onAddProduct}
            onIncreaseQuantity={onIncreaseQuantity}
            onDecreaseQuantity={onDecreaseQuantity}
            onRemoveProduct={onRemoveProduct}
            footer={
              <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                <p>
                  {t('ordersManager.amount.subtotal')}: {formatMoney(productSubtotal)}
                </p>
                <p>
                  {t('ordersManager.amount.deliveryFee')}:{' '}
                  {formatMoney(state.order.deliveryFee ?? 0)}
                </p>
                <p className="font-semibold">
                  {t('ordersManager.amount.total')}: {formatMoney(totalAmount)}
                </p>
              </div>
            }
          />
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending || !hasChanges} onClick={onSave}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderHistoryDialog({
  order,
  onOpenChange,
}: {
  order: OrderRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const historyQuery = useQuery({
    queryKey: ['order-history', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  const detail = historyQuery.data?.item ?? order;

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('ordersManager.history.title')}</DialogTitle>
          <DialogDescription>{detail?.fullName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {detail?.statusHistory.length ? (
            detail.statusHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge>{formatOrderStatusLabel(t, item.status)}</Badge>
                  <p className="text-xs text-muted-foreground">{item.changedAt}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.changedByName ?? item.changedBy ?? t('ordersManager.system')}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('ordersManager.history.empty')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
