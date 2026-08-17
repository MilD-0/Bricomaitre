'use client';

import { useQuery } from '@tanstack/react-query';
import { History, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { requestJson } from '../../lib/admin-api';
import type {
  EcotrackShipmentDetailResponse,
  EcotrackStatusSummary,
} from '../../lib/ecotrack-admin-contracts';
import { formatOrderPhoneForDisplay } from '../../lib/order-presentation';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  formatEcotrackDateTime,
  formatEcotrackMoney,
  getTrackingHistoryStatusKey,
} from './orders-ecotrack-presentation';

export function EcotrackStatusBadge({
  locale,
  status,
  t,
}: {
  locale: string;
  status: EcotrackStatusSummary;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {t(`ordersEcotrackManager.statuses.${status.currentStatus}`)}
        </Badge>
        {status.isStatusStale || status.isTrackingStale || status.isMajStale ? (
          <Badge variant="outline">{t('ordersEcotrackManager.staleBadge')}</Badge>
        ) : null}
      </div>
      {status.driverPhone ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.driverPhone')}: {formatOrderPhoneForDisplay(status.driverPhone)}
        </p>
      ) : null}
      {status.estimatedFee !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.estimatedFee')}:{' '}
          {formatEcotrackMoney(locale, status.estimatedFee)}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('ordersEcotrackManager.lastSync')}:{' '}
        {formatEcotrackDateTime(locale, status.lastStatusSyncedAt) ??
          t('ordersEcotrackManager.neverSynced')}
      </p>
    </div>
  );
}

export function EcotrackShipmentHistoryPanel({
  locale,
  orderId,
  enabled,
}: {
  locale: string;
  orderId: number;
  enabled: boolean;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['ecotrack-shipment-detail', orderId],
    queryFn: () =>
      requestJson<EcotrackShipmentDetailResponse>(`/api/orders/ecotrack/shipments/${orderId}`),
    enabled,
    staleTime: 30_000,
  });

  if (!enabled) {
    return null;
  }

  if (detailQuery.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.item) {
    return (
      <Empty className="rounded-[1rem] border border-dashed border-border/70 bg-muted/10">
        <EmptyHeader>
          <EmptyTitle>{t('ordersEcotrackManager.history.title')}</EmptyTitle>
          <EmptyDescription>
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : t('ordersEcotrackManager.history.empty')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const item = detailQuery.data.item;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="flex flex-col gap-3 border border-border/70 bg-background/90 shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.summaryTitle')}</h3>
          <Badge variant="outline">
            {t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}
          </Badge>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            {t('ordersEcotrackManager.lastSync')}:{' '}
            {formatEcotrackDateTime(locale, item.status.lastStatusSyncedAt) ??
              t('ordersEcotrackManager.neverSynced')}
          </p>
          <p>
            {t('ordersEcotrackManager.lastTrackingSync')}:{' '}
            {formatEcotrackDateTime(locale, item.status.lastTrackingSyncedAt) ??
              t('ordersEcotrackManager.neverSynced')}
          </p>
          <p>
            {t('ordersEcotrackManager.lastMajSync')}:{' '}
            {formatEcotrackDateTime(locale, item.status.lastMajSyncedAt) ??
              t('ordersEcotrackManager.neverSynced')}
          </p>
          {item.status.driverPhone ? (
            <p>
              {t('ordersEcotrackManager.driverPhone')}:{' '}
              {formatOrderPhoneForDisplay(item.status.driverPhone)}
            </p>
          ) : null}
          {item.status.deskPhone ? (
            <p>
              {t('ordersEcotrackManager.deskPhone')}:{' '}
              {formatOrderPhoneForDisplay(item.status.deskPhone)}
            </p>
          ) : null}
          {item.status.deskCommune ? (
            <p>
              {t('ordersEcotrackManager.deskCommune')}: {item.status.deskCommune}
            </p>
          ) : null}
          {item.status.deskAddress ? (
            <p>
              {t('ordersEcotrackManager.deskAddress')}: {item.status.deskAddress}
            </p>
          ) : null}
          {item.status.estimatedFee !== null ? (
            <p>
              {t('ordersEcotrackManager.estimatedFee')}:{' '}
              {formatEcotrackMoney(locale, item.status.estimatedFee)}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4">
        <Card className="border border-border/70 bg-background/90 shadow-none">
          <div className="mb-3 flex items-center gap-2">
            <History />
            <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.history.majTitle')}</h3>
          </div>
          <div className="flex flex-col gap-3">
            {item.majEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('ordersEcotrackManager.history.emptyMaj')}
              </p>
            ) : null}
            {item.majEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[1rem] border border-border/70 bg-muted/10 p-3 text-sm"
              >
                <p className="font-medium">{entry.remarque}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatEcotrackDateTime(locale, entry.remoteCreatedAt) ?? entry.remoteCreatedAt}
                </p>
                {entry.station || entry.livreur ? (
                  <p className="mt-1 text-muted-foreground">
                    {[entry.station, entry.livreur].filter(Boolean).join(' • ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border/70 bg-background/90 shadow-none">
          <div className="mb-3 flex items-center gap-2">
            <Truck />
            <h3 className="text-sm font-semibold">
              {t('ordersEcotrackManager.history.timelineTitle')}
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {item.trackingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('ordersEcotrackManager.history.emptyTimeline')}
              </p>
            ) : null}
            {item.trackingEvents.map((entry) => {
              const statusKey = getTrackingHistoryStatusKey(entry.status);
              return (
                <div
                  key={entry.id}
                  className="rounded-[1rem] border border-border/70 bg-muted/10 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{statusKey ? t(statusKey) : entry.status}</Badge>
                    <span className="text-muted-foreground">
                      {entry.eventDate} {entry.eventTime}
                    </span>
                  </div>
                  {entry.scanLocation ? (
                    <p className="mt-2 text-muted-foreground">{entry.scanLocation}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function OrdersEcotrackTableSkeleton() {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 8 }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: 8 }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <Skeleton className="h-16 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function OrdersEcotrackMobileSkeleton() {
  return (
    <div className="grid gap-4 p-4 lg:hidden">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card
          key={index}
          className="flex flex-col gap-3 border border-border/70 bg-background/90 shadow-none"
        >
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </Card>
      ))}
    </div>
  );
}
