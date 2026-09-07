'use client';
import { useQuery } from '@tanstack/react-query';
import { History, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestJson } from '../../../lib/admin-api';
import type {
  EcotrackShipmentDetailResponse,
  EcotrackShipmentListItem,
} from '../../../lib/ecotrack-admin-contracts';
import { formatOrderPhoneForDisplay } from '../../../lib/order-presentation';
import { SplitActionButton } from '../../split-action-button';
import { Skeleton } from '../../ui/skeleton';
import { EcotrackStatusBadge } from '../ecotrack-status-badge';
import {
  formatEcotrackDateTime,
  formatEcotrackMoney,
  getTrackingHistoryStatusKey,
} from '../orders-ecotrack-presentation';
import { type RowActionModel } from './contract';

export function ShipmentAction({ model, disabled }: { model: RowActionModel; disabled: boolean }) {
  return (
    <SplitActionButton
      size="sm"
      compactOnMobile
      label={model.primary.label}
      icon={model.primary.icon}
      primaryDisabled={disabled}
      onPrimaryClick={model.primary.onPrimaryClick}
      options={model.options}
    />
  );
}

export function ShipmentIdentity({
  item,
  locale,
  compact = false,
}: {
  item: EcotrackShipmentListItem;
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{item.trackingNumber}</span>
        <span className="shrink-0 text-[length:var(--type-size-label)] font-medium uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
          {item.provider}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {item.fullName} · {formatOrderPhoneForDisplay(item.phoneNumber1)}
      </p>
      {!compact ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('ordersEcotrackManager.reference')} {item.reference} ·{' '}
          {formatEcotrackDateTime(locale, item.createdAt)}
        </p>
      ) : null}
    </div>
  );
}

export function ShipmentInspector({
  item,
  locale,
  action,
  writable,
}: {
  item: EcotrackShipmentListItem;
  locale: string;
  action: RowActionModel;
  writable: boolean;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['ecotrack-shipment-detail', item.orderId],
    queryFn: () =>
      requestJson<EcotrackShipmentDetailResponse>(`/api/orders/ecotrack/shipments/${item.orderId}`),
    staleTime: 30_000,
  });
  const detail = detailQuery.data?.item;

  return (
    <section aria-label={t('ordersEcotrackManager.summaryTitle')} className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[var(--type-tracking-p080)] text-primary">
            #{item.reference}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold">{item.fullName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{item.trackingNumber}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EcotrackStatusBadge locale={locale} status={item.status} t={t} />
          <ShipmentAction
            model={action}
            disabled={(item.canDispatch || item.canAddMaj) && !writable}
          />
        </div>
      </header>

      <div className="grid border-b border-border sm:grid-cols-2">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-e">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.client')}</h3>
          <p className="mt-2 text-sm">{item.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {formatOrderPhoneForDisplay(item.phoneNumber1)}
          </p>
          {item.phoneNumber2 ? (
            <p className="text-sm text-muted-foreground">
              {formatOrderPhoneForDisplay(item.phoneNumber2)}
            </p>
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.address')}</h3>
          <p className="mt-2 text-sm">
            {item.homeAddress || t('ordersEcotrackManager.missingValue')}
          </p>
          <p className="text-sm text-muted-foreground">
            {[item.city, item.stateName ?? item.state].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid border-b border-border lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="p-4 lg:border-e lg:border-border">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.products')}</h3>
          <div className="mt-3 divide-y divide-border">
            {item.orderProducts.map((product, index) => (
              <div key={`${item.orderId}-inspect-${index}`} className="flex gap-4 py-2 text-sm">
                <span className="min-w-0 flex-1">{product.title}</span>
                <span className="text-muted-foreground">×{product.quantity}</span>
                <span className="font-medium">
                  {formatEcotrackMoney(locale, product.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 text-sm">
          <p className="flex justify-between gap-3 text-muted-foreground">
            <span>{t('ordersEcotrackManager.amounts.subtotal')}</span>
            <span>{formatEcotrackMoney(locale, item.productSubtotal)}</span>
          </p>
          <p className="mt-2 flex justify-between gap-3 text-muted-foreground">
            <span>{t('ordersEcotrackManager.amounts.deliveryFee')}</span>
            <span>{formatEcotrackMoney(locale, item.deliveryFee)}</span>
          </p>
          <p className="mt-3 flex justify-between gap-3 border-t border-border pt-3 font-semibold">
            <span>{t('ordersEcotrackManager.amounts.total')}</span>
            <span>{formatEcotrackMoney(locale, item.totalAmount)}</span>
          </p>
        </div>
      </div>

      {detailQuery.isPending ? (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {detailQuery.isError ? (
        <p className="p-4 text-sm text-destructive">{detailQuery.error.message}</p>
      ) : null}
      {detail ? (
        <div className="grid lg:grid-cols-2">
          <section className="border-b border-border p-4 lg:border-b-0 lg:border-e">
            <div className="flex items-center gap-2">
              <History className="size-4" />
              <h3 className="text-sm font-semibold">
                {t('ordersEcotrackManager.history.majTitle')}
              </h3>
            </div>
            <div className="mt-3 divide-y divide-border">
              {detail.majEntries.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  {t('ordersEcotrackManager.history.emptyMaj')}
                </p>
              ) : null}
              {detail.majEntries.map((entry) => (
                <div key={entry.id} className="py-3 text-sm">
                  <p>{entry.remarque}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatEcotrackDateTime(locale, entry.remoteCreatedAt)}
                    {entry.station || entry.livreur
                      ? ` · ${[entry.station, entry.livreur].filter(Boolean).join(' · ')}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="size-4" />
              <h3 className="text-sm font-semibold">
                {t('ordersEcotrackManager.history.timelineTitle')}
              </h3>
            </div>
            <div className="mt-3 divide-y divide-border">
              {detail.trackingEvents.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  {t('ordersEcotrackManager.history.emptyTimeline')}
                </p>
              ) : null}
              {detail.trackingEvents.map((event) => {
                const statusKey = getTrackingHistoryStatusKey(event.status);
                return (
                  <div key={event.id} className="py-3 text-sm">
                    <p>{statusKey ? t(statusKey) : event.status}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.eventDate} {event.eventTime}
                      {event.scanLocation ? ` · ${event.scanLocation}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
