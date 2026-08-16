'use client';

import { useLocale, useTranslations } from 'next-intl';

import type {
  DailyOrderStatusOverview,
  ProfitProjectionBasis,
} from '../../lib/order-admin-contracts';
import { Card } from '../ui/card';
import { PendingInline } from '../ui/motion';
import { Skeleton } from '../ui/skeleton';
import { Switch } from '../ui/switch';

function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(locale: string, value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatPercent(locale: string, value: number) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}
export function DailyOrderStatusOverviewPanel({
  overview,
  loading,
  projectionBasis,
  onProjectionBasisChange,
}: {
  overview: DailyOrderStatusOverview | undefined;
  loading: boolean;
  projectionBasis: ProfitProjectionBasis;
  onProjectionBasisChange: (basis: ProfitProjectionBasis) => void;
}) {
  const t = useTranslations('ordersManager.overview');
  const locale = useLocale();

  if (!overview && loading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!overview?.available) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('unavailable')}</p>
      </div>
    );
  }

  const reportDate = new Date(`${overview.reportDay}T00:00:00`);
  const formattedReportDay = Number.isNaN(reportDate.getTime())
    ? overview.reportDay
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(reportDate);
  const reports =
    overview.reports && overview.reports.length > 0
      ? overview.reports
      : [
          {
            reportDay: overview.reportDay,
            newOrders: overview.newOrders,
            confirmationStatusChanges: overview.confirmationStatusChanges,
            confirmedToday: overview.confirmedToday,
            noAnswerOrders: overview.noAnswerOrders,
            adminCancelled: overview.adminCancelled,
            carrierCancelled: overview.carrierCancelled,
            shipmentUpdates: overview.shipmentUpdates,
          },
        ];
  const hasProfitProjection = reports.some((report) => Boolean(report.profitProjection));

  return (
    <section
      className="rounded-xl border border-border/70 bg-background/90 p-3"
      aria-label={t('title')}
    >
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('subtitle', { date: formattedReportDay })}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {hasProfitProjection ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('projection.basisLabel')}</span>
              <Switch
                checked={projectionBasis === 'posted'}
                disabled={loading}
                aria-label={t('projection.basisLabel')}
                onCheckedChange={(checked) =>
                  onProjectionBasisChange(checked ? 'posted' : 'confirmed')
                }
              />
              <span className="font-medium text-foreground">
                {t(
                  projectionBasis === 'posted'
                    ? 'projection.postedBasis'
                    : 'projection.confirmedBasis',
                )}
              </span>
            </label>
          ) : null}
          {loading ? <PendingInline active label={t('refreshing')} /> : null}
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {reports.map((report, reportIndex) => {
          const date = new Date(`${report.reportDay}T00:00:00`);
          const formattedDate = Number.isNaN(date.getTime())
            ? report.reportDay
            : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
          const items = [
            { key: 'newOrders', value: report.newOrders },
            { key: 'confirmationStatusChanges', value: report.confirmationStatusChanges },
            { key: 'confirmedToday', value: report.confirmedToday },
            { key: 'noAnswerOrders', value: report.noAnswerOrders },
            { key: 'adminCancelled', value: report.adminCancelled },
            { key: 'carrierCancelled', value: report.carrierCancelled },
            { key: 'shipmentUpdates', value: report.shipmentUpdates },
          ] as const;

          return (
            <div key={report.reportDay} className="rounded-lg border border-border/70 p-3">
              <div className="mb-3">
                <p className="text-sm font-medium">
                  {t(reportIndex === 0 ? 'today' : 'yesterday')}
                </p>
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
                {items.map((item) => (
                  <Card key={item.key} className="rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{t(`metrics.${item.key}`)}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
                  </Card>
                ))}
              </div>
              {report.profitProjection ? (
                <div className="mt-3 rounded-lg border border-border/70 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{t('projection.title')}</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCurrency(locale, report.profitProjection.projectedProfit)}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t('projection.grossProfit')}</span>
                      <span className="font-medium">
                        {formatCurrency(locale, report.profitProjection.grossProfit)}
                      </span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t('projection.adSpend')}</span>
                      <span className="font-medium">
                        {formatCurrency(locale, report.profitProjection.adSpend)}
                      </span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t('projection.returnRate')}</span>
                      <span className="font-medium">
                        {formatPercent(locale, report.profitProjection.estimatedReturnRate)}
                      </span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t('projection.estimatedReturns')}
                      </span>
                      <span className="font-medium">
                        {formatNumber(locale, report.profitProjection.estimatedReturnedOrders, 1)}
                      </span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t('projection.returnLoss')}</span>
                      <span className="font-medium">
                        {formatCurrency(locale, report.profitProjection.estimatedReturnLoss)}
                      </span>
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
