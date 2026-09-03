'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  DailyOrderStatusOverview,
  ProfitProjectionBasis,
} from '../../lib/order-admin-contracts';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { formatOrderMoney } from './orders-workspace-presenters';

export function OrdersPulse({
  overview,
  projectionBasis,
  loading,
  onProjectionBasisChange,
}: {
  overview?: DailyOrderStatusOverview;
  projectionBasis: ProfitProjectionBasis;
  loading: boolean;
  onProjectionBasisChange: (basis: ProfitProjectionBasis) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('adminWorkspace.orders');
  const overviewT = useTranslations('ordersManager.overview');
  const [activeReportIndex, setActiveReportIndex] = useState(0);

  if (!overview?.available) return null;
  const activeReport = overview.reports[activeReportIndex] ?? overview.reports[0];
  if (!activeReport) return null;

  const oldestReportIndex = overview.reports.length - 1;
  const formatReportDay = (reportDay: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: overview.timezone,
    }).format(new Date(`${reportDay}T12:00:00Z`));
  const projection = activeReport.profitProjection;
  const projectionMoney = (value: number | null | undefined) =>
    value == null ? '—' : formatOrderMoney(locale, value);
  const updates = activeReport.confirmationStatusChanges + activeReport.shipmentUpdates;
  const cancellations = activeReport.adminCancelled + activeReport.carrierCancelled;

  return (
    <section data-orders-pulse className="border-b border-border/60 bg-card/30 p-2.5">
      <div
        className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5"
        data-mobile-projection-controls
      >
        <p className="order-1 min-w-0 truncate text-xs font-medium capitalize">
          {formatReportDay(activeReport.reportDay)}
        </p>
        <label className="order-3 flex w-full items-center justify-end gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground sm:order-2 sm:ms-auto sm:w-auto sm:border-0 sm:pt-0">
          <span>{overviewT('projection.confirmedBasis')}</span>
          <Switch
            checked={projectionBasis === 'posted'}
            aria-label={overviewT('projection.basisLabel')}
            onCheckedChange={(checked) => {
              setActiveReportIndex(0);
              onProjectionBasisChange(checked ? 'posted' : 'confirmed');
            }}
          />
          <span>{overviewT('projection.postedBasis')}</span>
        </label>
        <div className="order-2 ms-auto flex items-center gap-1 border-s border-border/60 ps-2 sm:order-3 sm:ms-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={activeReportIndex === 0}
            onClick={() => setActiveReportIndex(0)}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {overviewT('today')}
          </Button>
          <span className="flex items-center" dir="ltr">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              aria-label={t('nextDay')}
              disabled={activeReportIndex === 0}
              onClick={() => setActiveReportIndex((current) => Math.max(current - 1, 0))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              aria-label={t('previousDay')}
              disabled={activeReportIndex === oldestReportIndex}
              onClick={() =>
                setActiveReportIndex((current) => Math.min(current + 1, oldestReportIndex))
              }
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
      <div className="relative pb-2" data-projection-deck>
        <div
          aria-hidden="true"
          data-projection-stack-layer
          className="absolute inset-x-4 inset-y-0 translate-y-2 scale-[0.97] rounded-[var(--shape-radius-card-compact)] border border-border/45 bg-background/45"
        />
        <div
          aria-hidden="true"
          data-projection-stack-layer
          className="absolute inset-x-2 inset-y-0 translate-y-1 scale-[0.985] rounded-[var(--shape-radius-card-compact)] border border-border/55 bg-background/70 shadow-[var(--shadow-vapor)]"
        />
        <article
          key={activeReport.reportDay}
          aria-live="polite"
          className={cn(
            'relative z-10 overflow-hidden rounded-[var(--shape-radius-card-compact)] border border-border/65 bg-background shadow-[var(--shadow-vapor-strong)] transition-opacity',
            loading && 'opacity-65',
          )}
        >
          <div className="divide-y divide-border/55 sm:hidden" data-mobile-projection-summary>
            <div className="flex items-end justify-between gap-4 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[length:var(--type-size-label)] text-muted-foreground">
                  {t('projectedProfit')}
                </p>
                <p className="mt-0.5 truncate text-xl font-semibold tracking-[var(--type-tracking-n020)] tabular-nums">
                  {projectionMoney(projection?.projectedProfit)}
                </p>
              </div>
              <p className="shrink-0 pb-0.5 text-xs text-muted-foreground">
                {t('grossShort')}{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {projectionMoney(projection?.grossProfit)}
                </span>
              </p>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border/55 rtl:divide-x-reverse">
              {[
                [t('newShort'), activeReport.newOrders],
                [t('confirmedShort'), activeReport.confirmedToday],
                [t('noAnswerShort'), activeReport.noAnswerOrders],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 px-3 py-2.5">
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                  <dt className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 text-xs [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground">
                  {overviewT('projection.adSpend')} · {t('updates')}
                </span>
                <span className="ms-auto font-medium tabular-nums">
                  {projectionMoney(projection?.adSpend)} · {updates}
                </span>
                <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <dl className="grid grid-cols-2 border-t border-border/55 bg-muted/15">
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {overviewT('projection.adSpend')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projectionMoney(projection?.adSpend)}
                  </dd>
                </div>
                <div className="min-w-0 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {overviewT('projection.returnLoss')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                    {projectionMoney(projection?.estimatedReturnLoss)}
                  </dd>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {t('updates')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{updates}</dd>
                  <p className="truncate text-[length:var(--type-size-micro)] text-muted-foreground">
                    {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                    {activeReport.shipmentUpdates} {t('shipmentShort')}
                  </p>
                </div>
                <div className="min-w-0 border-t border-border/55 px-3.5 py-2.5">
                  <dt className="text-[length:var(--type-size-caption)] text-muted-foreground">
                    {t('cancelled')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{cancellations}</dd>
                  <p className="truncate text-[length:var(--type-size-micro)] text-muted-foreground">
                    {activeReport.adminCancelled} {t('adminShort')} ·{' '}
                    {activeReport.carrierCancelled} {t('carrierShort')}
                  </p>
                </div>
              </dl>
            </details>
          </div>
          <div
            data-projection-summary-grid
            className="hidden gap-px bg-border/45 sm:grid sm:grid-cols-3 lg:grid-cols-[minmax(9rem,1fr)_minmax(6rem,0.65fr)_minmax(9rem,1fr)_minmax(14rem,1.55fr)_minmax(9rem,0.95fr)_minmax(8rem,0.85fr)]"
          >
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('projectedProfit')}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-[var(--type-tracking-n020)] tabular-nums">
                {projectionMoney(projection?.projectedProfit)}
              </p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                {t('grossShort')} {projectionMoney(projection?.grossProfit)}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {overviewT('projection.adSpend')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projectionMoney(projection?.adSpend)}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {overviewT('projection.returnLoss')}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold tabular-nums">
                {projectionMoney(projection?.estimatedReturnLoss)}
              </p>
              {projection ? (
                <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                    projection.estimatedReturnRate,
                  )}
                  % ·{' '}
                  {t('expectedShort', {
                    count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                      projection.estimatedReturnedOrders,
                    ),
                  })}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('ordersSummary')}
              </p>
              <dl className="mt-1 grid grid-cols-3 gap-2">
                {[
                  [t('newShort'), activeReport.newOrders],
                  [t('confirmedShort'), activeReport.confirmedToday],
                  [t('noAnswerShort'), activeReport.noAnswerOrders],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col">
                    <dt className="order-2 truncate text-[length:var(--type-size-micro)] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="order-1 text-base font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('updates')}
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{updates}</p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                {activeReport.confirmationStatusChanges} {t('confirmationShort')} ·{' '}
                {activeReport.shipmentUpdates} {t('shipmentShort')}
              </p>
            </div>
            <div className="min-w-0 bg-background px-3 py-2">
              <p className="truncate text-[length:var(--type-size-label)] text-muted-foreground">
                {t('cancelled')}
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{cancellations}</p>
              <p className="truncate text-[length:var(--type-size-caption)] text-muted-foreground">
                {activeReport.adminCancelled} {t('adminShort')} · {activeReport.carrierCancelled}{' '}
                {t('carrierShort')}
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
