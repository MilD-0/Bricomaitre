'use client';

import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { Line } from 'recharts';

import type {
  AnalyticsCashStage,
  AnalyticsMetric,
  AnalyticsPayload,
  AnalyticsView,
} from '../../lib/analytics';
import { analyticsFocusAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import type { AdminAiAnalyticsFocusDimension } from '../../lib/admin-ai-analytics-focus';
import { cn } from '../../lib/utils';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import {
  AnalyticsDenseTable,
  AnalyticsMetricCell,
  AnalyticsMetricStrip,
  AnalyticsSection,
} from './analytics-presentation';
import {
  formatDzd as formatMoney,
  formatEur,
  formatNumber,
  formatPercent,
  formatRatio,
} from './analytics-format';
import { getAnalyticsCopy, type AnalyticsCopy } from './analytics-copy';

export type DataOf<Kind extends AnalyticsPayload['data']['kind']> = Extract<
  AnalyticsPayload['data'],
  { kind: Kind }
>;

export const chartColors = ['#7c3aed', '#0f766e', '#e11d48', '#d97706', '#2563eb', '#64748b'];

type AnalyticsAssistantFocus = {
  dimension: AdminAiAnalyticsFocusDimension;
  search?: string | null;
  identifiers?: string[];
};

export const AnalyticsAssistantFocusContext = createContext<{
  active: AnalyticsAssistantFocus | null;
  setActive: (focus: AnalyticsAssistantFocus) => void;
} | null>(null);

const defaultAnalyticsAssistantFocus: Partial<
  Record<AnalyticsView, AdminAiAnalyticsFocusDimension>
> = {
  command: 'economics_timeline',
  money: 'economics_timeline',
  fulfillment: 'cash_pipeline',
  storefront: 'storefront_trend',
};

export function AnalyticsAssistantFocusProvider({
  view,
  children,
}: {
  view: AnalyticsView;
  children: React.ReactNode;
}) {
  const defaultDimension = defaultAnalyticsAssistantFocus[view];
  const [active, setActive] = useState<AnalyticsAssistantFocus | null>(() =>
    defaultDimension ? { dimension: defaultDimension } : null,
  );
  return (
    <AnalyticsAssistantFocusContext.Provider value={{ active, setActive }}>
      {children}
    </AnalyticsAssistantFocusContext.Provider>
  );
}

export function formatHours(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${formatNumber(locale, value)} h`;
}

function funnelLabel(copy: AnalyticsCopy, key: string) {
  const labels: Record<string, string> = {
    Sessions: copy.labels.sessions,
    'Product-view sessions': copy.labels.productViewSessions,
    'Cart sessions': copy.labels.cartSessions,
    'Checkout sessions': copy.labels.checkoutSessions,
    'Submitted-order sessions': copy.labels.submittedOrderSessions,
    submitted: copy.labels.submitted,
    confirmed: copy.labels.confirmed,
    posted: copy.labels.posted,
    delivered: copy.labels.delivered,
    paid: copy.labels.paid,
    impressions: copy.labels.impressions,
    outboundClicks: copy.labels.outboundClicks,
    landingViews: copy.labels.landingViews,
    bricOrders: copy.labels.bricOrders,
  };
  return labels[key] ?? key.replaceAll('_', ' ');
}

export function fulfillmentPhaseLabel(copy: AnalyticsCopy, phase: string) {
  const labels = copy.fulfillmentPhases as Record<string, string>;
  return labels[phase] ?? phase.replaceAll('_', ' ');
}

export function formatMetric(locale: string, metric: Pick<AnalyticsMetric, 'value' | 'unit'>) {
  switch (metric.unit) {
    case 'dzd':
      return formatMoney(locale, metric.value, true);
    case 'eur':
      return formatEur(locale, metric.value);
    case 'percent':
      return formatPercent(locale, metric.value);
    case 'ratio':
      return formatRatio(locale, metric.value);
    case 'hours':
      return formatHours(locale, metric.value);
    case 'number':
      return formatNumber(locale, metric.value, true);
  }
}

export function MetricStrip({
  metrics,
  copy,
  locale,
}: {
  metrics: AnalyticsMetric[];
  copy: AnalyticsCopy;
  locale: string;
}) {
  return (
    <AnalyticsMetricStrip>
      {metrics.map((item) => {
        const rising = item.changePct != null && item.changePct >= 0;
        const positive =
          item.goodWhen === 'neutral' ? null : item.goodWhen === 'down' ? !rising : rising;
        return (
          <AnalyticsMetricCell
            key={item.key}
            label={copy.metrics[item.key as keyof typeof copy.metrics] ?? item.key}
            value={
              <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-end sm:gap-2">
                <strong className="max-w-full whitespace-nowrap text-lg font-semibold tracking-[-0.035em] tabular-nums sm:text-2xl">
                  {formatMetric(locale, item)}
                </strong>
                {item.changePct != null ? (
                  <span
                    className={cn(
                      'mb-0.5 inline-flex items-center text-xs font-medium tabular-nums',
                      positive == null
                        ? 'text-muted-foreground'
                        : positive
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400',
                    )}
                  >
                    {rising ? (
                      <ArrowUpRight className="size-3" />
                    ) : (
                      <ArrowDownRight className="size-3" />
                    )}
                    {formatPercent(locale, Math.abs(item.changePct))}
                  </span>
                ) : null}
              </div>
            }
            detail={
              <p className="truncate text-muted-foreground/75">
                {item.previous == null ? copy.noComparison : copy.previousPeriod}
              </p>
            }
          />
        );
      })}
    </AnalyticsMetricStrip>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  analyticsFocus,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  analyticsFocus?: AnalyticsAssistantFocus;
}) {
  const focusContext = useContext(AnalyticsAssistantFocusContext);
  const active = Boolean(
    analyticsFocus && focusContext?.active?.dimension === analyticsFocus.dimension,
  );
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails(
      active && analyticsFocus
        ? {
            dimension: analyticsFocus.dimension,
            search: analyticsFocus.search,
            identifiers: analyticsFocus.identifiers,
          }
        : { dimension: null },
    ),
  );
  return (
    <AnalyticsSection
      title={title}
      description={description}
      action={action}
      data-analytics-ai-focus={analyticsFocus?.dimension}
      data-analytics-ai-active={active || undefined}
      className={cn(active && 'bg-primary/[0.018]', className)}
    >
      {children}
    </AnalyticsSection>
  );
}

export function splitPartialSeries(
  rows: Array<Record<string, string | number | boolean | null>>,
  keys: string[],
) {
  return rows.map((row, index) => {
    const partial = row.isPartial === true;
    const nextIsPartial = rows[index + 1]?.isPartial === true;
    const result = { ...row };
    for (const key of keys) {
      const projected = row[`${key}Projected`];
      const projectedValue = typeof projected === 'number' ? projected : null;
      result[`${key}Actual`] = row[key];
      result[`${key}Open`] = partial ? projectedValue : nextIsPartial ? row[key] : null;
      result[`${key}Display`] = partial ? projectedValue : row[key];
    }
    return result;
  });
}

export function ActualOpenLine({
  dataKey,
  name,
  stroke,
  strokeWidth,
}: {
  dataKey: string;
  name: string;
  stroke: string;
  strokeWidth: number;
}) {
  return (
    <>
      <Line
        type="monotone"
        dataKey={`${dataKey}Actual`}
        name={name}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dot={false}
        connectNulls={false}
      />
      <Line
        type="monotone"
        dataKey={`${dataKey}Open`}
        name={`${name} · Forecast`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="5 4"
        dot={false}
        connectNulls={false}
      />
    </>
  );
}

export function chartTooltip(
  locale: string,
  kind: 'money' | 'number' | 'ratio' | 'percent' | 'eur' = 'number',
) {
  return {
    contentStyle: {
      borderRadius: '10px',
      border: '1px solid color-mix(in oklab, var(--border) 70%, transparent)',
      background: 'color-mix(in oklab, var(--background) 96%, transparent)',
      fontSize: '12px',
    },
    formatter: (value: unknown, name: unknown) => {
      const number = Number(value);
      const formatted =
        kind === 'money'
          ? formatMoney(locale, number)
          : kind === 'ratio'
            ? formatRatio(locale, number)
            : kind === 'percent'
              ? formatPercent(locale, number)
              : kind === 'eur'
                ? formatEur(locale, number)
                : formatNumber(locale, number);
      return [formatted, String(name)];
    },
  } as const;
}

export function DenseTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const locale = useLocale();
  return (
    <AnalyticsDenseTable label={getAnalyticsCopy(locale).exactRows} className={className}>
      {children}
    </AnalyticsDenseTable>
  );
}

export function SourceRail({
  payload,
  copy,
  locale,
}: {
  payload: AnalyticsPayload;
  copy: AnalyticsCopy;
  locale: string;
}) {
  return (
    <div className="border-b border-border/60 bg-muted/10 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {copy.sourceHealth}
        </span>
        {payload.sources
          .filter((source) => source.key !== 'settlements')
          .map((source) => {
            const state =
              payload.reviewClock && source.state !== 'manual' && source.state !== 'missing'
                ? 'current'
                : source.state;
            return (
              <div key={source.key} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    state === 'live' || state === 'current'
                      ? 'bg-emerald-500'
                      : state === 'manual'
                        ? 'bg-violet-500'
                        : state === 'lagged'
                          ? 'bg-amber-500'
                          : 'bg-rose-500',
                  )}
                />
                <span className="font-medium">{copy.sources[source.key]}</span>
                <span className="text-muted-foreground">{copy.sourceStates[state]}</span>
                {source.coveragePct != null ? (
                  <span className="tabular-nums text-muted-foreground">
                    {formatPercent(locale, source.coveragePct)}
                  </span>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function WarningRail({
  payload,
  copy,
  locale,
}: {
  payload: AnalyticsPayload;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const visibleWarnings =
    payload.data.kind === 'storefront' || payload.data.kind === 'search'
      ? []
      : payload.warnings.filter((warning) => {
          const detail = warning as { key: string; source?: string; value?: number | null };
          if (detail.source === 'settlements') return false;
          if (payload.reviewClock && detail.key === 'sourcePartial') return false;
          return !(detail.key === 'projectedCostCoverage' && (detail.value ?? 0) >= 95);
        });

  if (!visibleWarnings.length) return null;
  return (
    <div className="border-b border-amber-500/25 bg-amber-500/7 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 sm:px-6">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {visibleWarnings.map((warning, index) => {
          const detail = warning as { key: string; source?: string; value?: number | null };
          const source = detail.source
            ? (copy.sources[detail.source as keyof typeof copy.sources] ?? detail.source)
            : null;
          const value =
            typeof detail.value !== 'number'
              ? null
              : detail.key === 'pendingFridayRollforward'
                ? formatMoney(locale, detail.value)
                : detail.key === 'projectedCostCoverage' ||
                    detail.key === 'sourcePartial' ||
                    detail.key === 'searchDetailCoverage'
                  ? formatPercent(locale, detail.value)
                  : formatNumber(locale, detail.value);
          return (
            <span key={`${warning.key}-${index}`} className="inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              {copy.warningLabels[warning.key as keyof typeof copy.warningLabels] ?? warning.key}
              {source ? ` · ${source}` : null}
              {value ? ` · ${value}` : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Funnel({
  rows,
  copy,
  locale,
}: {
  rows: Array<{ key?: string; name?: string; value: number }>;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={row.key ?? row.name ?? index}
          className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-muted-foreground">
            {funnelLabel(copy, row.name ?? row.key ?? '')}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </span>
          <strong className="min-w-12 text-end tabular-nums">
            {formatNumber(locale, row.value)}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function CashPipeline({
  rows,
  copy,
  locale,
}: {
  rows: AnalyticsCashStage[];
  copy: AnalyticsCopy;
  locale: string;
}) {
  const visibleRows = rows.filter(
    (row) =>
      row.orders > 0 ||
      row.amountDzd > 0 ||
      (row.providerAmountCoveragePct != null && row.providerAmountCoveragePct > 0),
  );

  if (!visibleRows.length) return null;

  return (
    <div
      role="region"
      aria-label={copy.sections.cashPipeline}
      tabIndex={0}
      className="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(14rem,80vw)] overflow-x-auto border-y border-border/60 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 sm:snap-none sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible xl:flex"
    >
      {visibleRows.map((row) => (
        <div
          key={row.key}
          className="min-w-0 snap-start border-e border-border/45 px-4 py-4 last:border-e-0 sm:border-b xl:flex-1 xl:border-b-0"
        >
          <p className="min-h-8 text-xs font-medium leading-4 text-muted-foreground">
            {copy.cashStages[row.key]}
          </p>
          <p className="mt-1 text-xl font-semibold tracking-[-0.025em]">
            {formatMoney(locale, row.amountDzd, true)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{formatNumber(locale, row.orders)} orders</span>
          </div>
          {row.confidencePct != null ? (
            <p className="mt-1 text-[10px] text-muted-foreground/75">
              {formatPercent(locale, row.confidencePct)} {copy.expectedToPost}
            </p>
          ) : row.providerAmountCoveragePct != null ? (
            <p className="mt-1 text-[10px] text-muted-foreground/75">
              {formatPercent(locale, row.providerAmountCoveragePct)} provider COD
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
