'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import type {
  Analytics2CashStage,
  Analytics2EntityLevel,
  Analytics2Metric,
  Analytics2Payload,
  Analytics2Range,
  Analytics2View,
} from '../../lib/analytics2';
import { statsPath } from '../../lib/analytics2-routes';
import { requestJson as request } from '../../lib/admin-api';
import { analyticsAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { getAnalytics2Copy, type Analytics2Copy } from './analytics2-copy';
import { AlgeriaWilayaMap } from './algeria-wilaya-map';

type DataOf<Kind extends Analytics2Payload['data']['kind']> = Extract<
  Analytics2Payload['data'],
  { kind: Kind }
>;

const chartColors = ['#7c3aed', '#0f766e', '#e11d48', '#d97706', '#2563eb', '#64748b'];
const rangeKeys: Analytics2Range[] = ['7d', '14d', '30d', '90d', 'year', 'all', 'custom'];
const grainKeys = ['auto', 'day', 'week', 'month'] as const;

const ResponsiveChart = ResponsiveContainer as React.ComponentType<{
  width: string;
  height: string;
  children: React.ReactNode;
}>;

function formatMoney(locale: string, value: number | null | undefined, compact = false) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

function formatEur(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(locale: string, value: number | null | undefined, compact = false) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

function formatPercent(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatRatio(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

function formatHours(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${formatNumber(locale, value)} h`;
}

function formatMetric(locale: string, metric: Pick<Analytics2Metric, 'value' | 'unit'>) {
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

function formatDate(locale: string, value: string | null | undefined, short = true) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale,
    short ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium' },
  ).format(date);
}

function MetricStrip({
  metrics,
  copy,
  locale,
}: {
  metrics: Analytics2Metric[];
  copy: Analytics2Copy;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 border-b border-border/60 sm:[grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
      {metrics.map((item) => {
        const rising = item.changePct != null && item.changePct >= 0;
        const positive =
          item.goodWhen === 'neutral' ? null : item.goodWhen === 'down' ? !rising : rising;
        return (
          <div
            key={item.key}
            className="min-w-0 border-b border-border/45 px-4 py-4 sm:border-e lg:border-b-0"
          >
            <p className="truncate text-xs font-medium text-muted-foreground">
              {copy.metrics[item.key as keyof typeof copy.metrics] ?? item.key}
            </p>
            <div className="mt-1.5 flex items-end gap-2">
              <strong className="truncate text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
                {formatMetric(locale, item)}
              </strong>
              {item.changePct != null ? (
                <span
                  className={cn(
                    'mb-0.5 inline-flex items-center text-xs font-medium tabular-nums',
                    positive == null
                      ? 'text-muted-foreground'
                      : positive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
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
            <p className="mt-1 truncate text-[11px] text-muted-foreground/75">
              {item.previous == null ? copy.noComparison : copy.previousPeriod}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0 border-b border-border/60 px-4 py-6 sm:px-6', className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ChartFrame({
  children,
  className = 'h-[19rem]',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('min-w-0 overflow-hidden', className)}>{children}</div>;
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

function ActualOpenLine({
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

function chartTooltip(
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

function DenseTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('max-h-[34rem] min-w-0 overflow-auto', className)}>
      <table className="w-full min-w-[46rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 border-y border-border/60 bg-background/95 text-start text-[11px] uppercase tracking-[0.08em] text-muted-foreground backdrop-blur">
      {children}
    </thead>
  );
}

function SourceRail({
  payload,
  copy,
  locale,
}: {
  payload: Analytics2Payload;
  copy: Analytics2Copy;
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

function WarningRail({
  payload,
  copy,
  locale,
}: {
  payload: Analytics2Payload;
  copy: Analytics2Copy;
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

function Funnel({
  rows,
  locale,
}: {
  rows: Array<{ key?: string; name?: string; value: number }>;
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
          <span className="truncate text-muted-foreground">{row.name ?? row.key}</span>
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

function CashPipeline({
  rows,
  copy,
  locale,
}: {
  rows: Analytics2CashStage[];
  copy: Analytics2Copy;
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
    <div className="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(14rem,80vw)] overflow-x-auto border-y border-border/60 sm:snap-none sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible xl:flex">
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

function signalTarget(key: string): Analytics2View {
  if (key === 'returnAssumptionGap' || key === 'costCoverageGap') return 'assumptions';
  if (key === 'activePipeline') return 'fulfillment';
  return 'money';
}

function CommandView({
  data,
  copy,
  locale,
  onNavigate,
}: {
  data: DataOf<'command'>;
  copy: Analytics2Copy;
  locale: string;
  onNavigate: (view: Analytics2View) => void;
}) {
  const trajectory = splitPartialSeries(
    data.trajectory as Array<Record<string, string | number | boolean | null>>,
    ['trueProfitDzd', 'automaticPaidProfitDzd'],
  );
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
        <Section title={copy.sections.trajectory}>
          <ChartFrame className="h-[23rem]">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={trajectory} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="commandTrueProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale, 'money')} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="trueProfitDzdActual"
                  name={copy.metrics.trueProfit}
                  fill="url(#commandTrueProfit)"
                  stroke="none"
                  connectNulls={false}
                />
                <ActualOpenLine
                  dataKey="trueProfitDzd"
                  name={copy.metrics.trueProfit}
                  stroke="#7c3aed"
                  strokeWidth={2.2}
                />
                <ActualOpenLine
                  dataKey="automaticPaidProfitDzd"
                  name={copy.metrics.automaticPaidProfit}
                  stroke="#0f766e"
                  strokeWidth={2.2}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">
                {formatMoney(locale, data.forecast.nextSevenDayTrueProfitDzd)}
              </b>{' '}
              next 7-day model
            </span>
            <span>
              <b className="text-foreground">
                {formatPercent(locale, data.economics.coverage.projectedCoveragePct)}
              </b>{' '}
              purchase-cost coverage
            </span>
            <span>
              <b className="text-foreground">
                {formatMoney(locale, data.economics.automaticPaid.summary.profitDzd)}
              </b>{' '}
              automatic paid profit
            </span>
          </div>
        </Section>
        <div className="border-s border-border/60">
          <Section title={copy.sections.signals}>
            <div className="divide-y divide-border/50 border-y border-border/60">
              {data.signals.map((signal) => (
                <button
                  key={signal.key}
                  type="button"
                  className="flex w-full items-start gap-3 py-3 text-start hover:bg-muted/25"
                  onClick={() => onNavigate(signalTarget(signal.key))}
                >
                  <span
                    className={cn(
                      'mt-1 size-2 shrink-0 rounded-full',
                      signal.severity === 'critical'
                        ? 'bg-rose-500'
                        : signal.severity === 'watch'
                          ? 'bg-amber-500'
                          : signal.severity === 'positive'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {copy.signalLabels[signal.key as keyof typeof copy.signalLabels] ??
                        signal.key}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMetric(locale, signal)}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
                </button>
              ))}
              {!data.signals.length ? (
                <p className="py-5 text-sm text-muted-foreground">{copy.noData}</p>
              ) : null}
            </div>
          </Section>
          <Section title={copy.sections.commerceFunnel}>
            <Funnel rows={data.fulfillment.funnel} locale={locale} />
          </Section>
        </div>
      </div>
      <Section title={copy.sections.cashPipeline}>
        <CashPipeline rows={data.fulfillment.cashPipeline} copy={copy} locale={locale} />
      </Section>
    </>
  );
}

function MoneyView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'money'>;
  copy: Analytics2Copy;
  locale: string;
}) {
  const [mode, setMode] = useState<'projected' | 'realized' | 'cumulative'>('projected');
  const sourceRows = (mode === 'realized' ? data.paidSeries : data.series) as Array<
    Record<string, string | number | boolean | null>
  >;
  const chartData = splitPartialSeries(
    sourceRows,
    mode === 'realized'
      ? ['codDzd', 'profitDzd']
      : mode === 'cumulative'
        ? ['cumulativeNetProfitDzd', 'cumulativeTrueProfitDzd']
        : ['grossProfitDzd', 'adjustedProfitDzd', 'netProfitDzd', 'trueProfitDzd'],
  );
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.moneyPerformance}
        action={
          <div className="flex rounded-lg bg-muted/55 p-1">
            {(['projected', 'realized', 'cumulative'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  mode === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {copy.modes[key]}
              </button>
            ))}
          </div>
        }
      >
        <ChartFrame className="h-[25rem]">
          <ResponsiveChart width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tickFormatter={(value) => formatDate(locale, String(value))}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                tickLine={false}
                axisLine={false}
                width={56}
                fontSize={11}
              />
              <Tooltip {...chartTooltip(locale, 'money')} />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              {mode === 'projected' ? (
                <>
                  <Bar
                    dataKey="adCostDzdDisplay"
                    name={copy.columns.adCost}
                    fill="#d97706"
                    opacity={0.45}
                  />
                  <ActualOpenLine
                    dataKey="grossProfitDzd"
                    name={copy.columns.grossProfit}
                    stroke="#64748b"
                    strokeWidth={1.5}
                  />
                  <ActualOpenLine
                    dataKey="adjustedProfitDzd"
                    name={copy.columns.adjustedProfit}
                    stroke="#2563eb"
                    strokeWidth={1.8}
                  />
                  <ActualOpenLine
                    dataKey="netProfitDzd"
                    name={copy.columns.netProfit}
                    stroke="#7c3aed"
                    strokeWidth={2}
                  />
                  <ActualOpenLine
                    dataKey="trueProfitDzd"
                    name={copy.columns.trueProfit}
                    stroke="#0f766e"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
              {mode === 'realized' ? (
                <>
                  <Bar dataKey="feesDzd" name="EcoTrack fee" fill="#d97706" opacity={0.45} />
                  <ActualOpenLine
                    dataKey="codDzd"
                    name="Paid COD"
                    stroke="#2563eb"
                    strokeWidth={1.6}
                  />
                  <ActualOpenLine
                    dataKey="profitDzd"
                    name={copy.metrics.automaticPaidProfit}
                    stroke="#0f766e"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
              {mode === 'cumulative' ? (
                <>
                  <ActualOpenLine
                    dataKey="cumulativeNetProfitDzd"
                    name={copy.columns.netProfit}
                    stroke="#7c3aed"
                    strokeWidth={2}
                  />
                  <ActualOpenLine
                    dataKey="cumulativeTrueProfitDzd"
                    name={copy.columns.trueProfit}
                    stroke="#0f766e"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
            </ComposedChart>
          </ResponsiveChart>
        </ChartFrame>
      </Section>
      <Section title={copy.sections.paidEconomics}>
        <div className="mb-4 grid grid-cols-2 border-y border-border/60 lg:grid-cols-5">
          {[
            ['Paid COD', formatMoney(locale, data.automaticPaid.summary.codDzd)],
            ['Estimated fees', formatMoney(locale, data.automaticPaid.summary.feesDzd)],
            ['Net recovered', formatMoney(locale, data.automaticPaid.summary.netRecoveredDzd)],
            [
              copy.metrics.automaticPaidProfit,
              formatMoney(locale, data.automaticPaid.summary.profitDzd),
            ],
            [
              'Exact cost coverage',
              formatPercent(locale, data.automaticPaid.summary.profitCoveragePct),
            ],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-e border-border/45 px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.date}</th>
              <th className="px-3 py-2 text-end">{copy.columns.paid}</th>
              <th className="px-3 py-2 text-end">COD</th>
              <th className="px-3 py-2 text-end">Fees</th>
              <th className="px-3 py-2 text-end">{copy.columns.profit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.coverage}</th>
              <th className="px-3 py-2 text-end">Provider COD</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.paidSeries
              .slice()
              .reverse()
              .slice(0, 90)
              .map((row) => (
                <tr key={row.bucket}>
                  <td className="px-3 py-2.5 font-medium">
                    {formatDate(locale, row.bucket, false)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.paidOrders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.codDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.feesDzd)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end font-medium tabular-nums',
                      row.profitDzd < 0 && 'text-rose-600',
                    )}
                  >
                    {formatMoney(locale, row.profitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.profitCoveragePct)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.providerAmountCoveragePct)}
                  </td>
                </tr>
              ))}
          </tbody>
        </DenseTable>
      </Section>
      <Section title="Profit maturation">
        <ChartFrame className="h-[22rem]">
          <ResponsiveChart width="100%" height="100%">
            <ComposedChart
              data={data.cohorts.slice().reverse()}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={(value) => formatDate(locale, String(value))}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                tickLine={false}
                axisLine={false}
                width={52}
                fontSize={11}
              />
              <Tooltip {...chartTooltip(locale, 'money')} />
              <Bar
                dataKey="projectedTrueProfitDzd"
                name="Projected true profit"
                fill="#7c3aed"
                opacity={0.32}
              />
              <Bar
                dataKey="deliveredTrueProfitDzd"
                name="Delivered true profit"
                fill="#2563eb"
                opacity={0.5}
              />
              <Bar dataKey="paidTrueProfitDzd" name="Paid true profit" fill="#0f766e" />
            </ComposedChart>
          </ResponsiveChart>
        </ChartFrame>
        <DenseTable className="mt-5">
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">Posting week</th>
              <th className="px-3 py-2 text-end">Posted</th>
              <th className="px-3 py-2 text-end">Delivered</th>
              <th className="px-3 py-2 text-end">Paid</th>
              <th className="px-3 py-2 text-end">Projected</th>
              <th className="px-3 py-2 text-end">Paid profit</th>
              <th className="px-3 py-2 text-end">Variance</th>
              <th className="px-3 py-2 text-end">Maturity</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.cohorts.slice(0, 18).map((cohort: DataOf<'money'>['cohorts'][number]) => (
              <tr key={cohort.weekStart} className={!cohort.mature ? 'bg-amber-500/5' : undefined}>
                <td className="px-3 py-2.5 font-medium">
                  {formatDate(locale, cohort.weekStart, false)}
                  {!cohort.mature ? (
                    <span className="ms-2 text-[10px] text-amber-700">Open</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.posted)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.delivered)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.paid)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, cohort.projectedTrueProfitDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, cohort.paidTrueProfitDzd)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-end font-medium tabular-nums',
                    cohort.varianceDzd != null && cohort.varianceDzd < 0 && 'text-rose-600',
                  )}
                >
                  {formatMoney(locale, cohort.varianceDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(
                    locale,
                    cohort.posted > 0
                      ? ((cohort.paid + cohort.returned) / cohort.posted) * 100
                      : null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>
      <div className="grid xl:grid-cols-2">
        <Section title={copy.sections.weeklyEconomics}>
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.date}</th>
                <th className="px-3 py-2 text-end">{copy.columns.spend}</th>
                <th className="px-3 py-2 text-end">{copy.columns.profitX}</th>
                <th className="px-3 py-2 text-end">{copy.columns.trueProfit}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.weeks.slice(0, 12).map((week) => (
                <tr key={week.weekStart}>
                  <td className="px-3 py-2.5 font-medium">
                    {formatDate(locale, week.weekStart, false)}
                    {week.isPartial ? (
                      <span className="ms-2 text-[10px] text-amber-700">{copy.partialPeriod}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, week.adCostDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatRatio(locale, week.profitX)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end font-medium tabular-nums',
                      week.trueProfitDzd < 0 && 'text-rose-600',
                    )}
                  >
                    {formatMoney(locale, week.trueProfitDzd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
        <Section title={copy.sections.forecast}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={data.forecast}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale, 'money')} />
                <Area
                  dataKey="upperTrueProfitDzd"
                  name="Upper"
                  fill="#7c3aed"
                  fillOpacity={0.08}
                  stroke="none"
                />
                <Area
                  dataKey="lowerTrueProfitDzd"
                  name="Lower"
                  fill="var(--background)"
                  stroke="none"
                />
                <Line
                  type="monotone"
                  dataKey="forecastTrueProfitDzd"
                  name={copy.metrics.trueProfit}
                  stroke="#7c3aed"
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
      <Section title={copy.sections.economicsLedger}>
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.date}</th>
              <th className="px-3 py-2 text-end">{copy.columns.posted}</th>
              <th className="px-3 py-2 text-end">{copy.columns.grossProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.adjustedProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.adCost}</th>
              <th className="px-3 py-2 text-end">{copy.columns.trueProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.coverage}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.series
              .slice()
              .reverse()
              .slice(0, 90)
              .map((row) => (
                <tr key={row.bucket} className={row.isPartial ? 'bg-amber-500/5' : undefined}>
                  <td className="px-3 py-2.5 font-medium">
                    {formatDate(locale, row.bucket, false)}
                    {row.isPartial ? (
                      <span className="ms-2 text-[10px] text-amber-700">{copy.partialPeriod}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.postedOrders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.grossProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.adjustedProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.adCostDzd)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end font-medium tabular-nums',
                      row.trueProfitDzd != null && row.trueProfitDzd < 0 && 'text-rose-600',
                    )}
                  >
                    {formatMoney(locale, row.trueProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.projectedCoveragePct)}
                  </td>
                </tr>
              ))}
          </tbody>
        </DenseTable>
      </Section>
    </>
  );
}

function AcquisitionView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'acquisition'>;
  filters: Analytics2Payload['filters'];
  copy: Analytics2Copy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<Analytics2EntityLevel>('adset');
  const entityKey = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads';
  const entities = data.entities[entityKey];
  const daily = data.entityDaily[entityKey];
  const [selectionByLevel, setSelectionByLevel] = useState<Record<Analytics2EntityLevel, string[]>>(
    () => ({
      campaign: data.entities.campaigns.slice(0, 3).map((entity) => entity.id),
      adset: data.entities.adsets.slice(0, 3).map((entity) => entity.id),
      ad: data.entities.ads.slice(0, 3).map((entity) => entity.id),
    }),
  );
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = entities.find((entity) => entity.id === inspectedId) ?? null;
  const availableIds = new Set(entities.map((entity) => entity.id));
  const selectedForLevel = selectionByLevel[level].filter((id) => availableIds.has(id));
  const selectedIds = selectedForLevel.length
    ? selectedForLevel
    : entities.slice(0, 3).map((entity) => entity.id);

  function setSelectedIds(update: (current: string[]) => string[]) {
    setSelectionByLevel((current) => ({ ...current, [level]: update(selectedIds) }));
  }

  const comparison = (() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of daily) {
      if (!selectedIds.includes(row.id)) continue;
      const current = byDate.get(row.day) ?? { day: row.day };
      const index = selectedIds.indexOf(row.id);
      current[`series${index}`] = row.adCostDzd;
      byDate.set(row.day, current);
    }
    return [...byDate.values()].sort((left, right) =>
      String(left.day).localeCompare(String(right.day)),
    );
  })();
  const campaignNames = new Map(
    data.entities.campaigns.map((campaign) => [campaign.id, campaign.name]),
  );
  const maturationCampaigns = data.breakdowns.maturation.slice(0, 5);
  const maturationChart = [0, 3, 7, 14, 21].map((day) => ({
    day,
    ...Object.fromEntries(
      maturationCampaigns.map((campaign, index) => [
        `series${index}`,
        campaign.points.find((point) => point.day === day)?.paidRatePct ?? null,
      ]),
    ),
  }));
  const profitSeries = splitPartialSeries(
    data.profitSeries as Array<Record<string, string | number | boolean | null>>,
    ['profitXBeforeReturns', 'profitX'],
  );

  const syncMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since: filters.startDate, until: filters.endDate }),
      }),
    onSuccess: async () => {
      toast.success('Meta insights synchronized.');
      await queryClient.invalidateQueries({ queryKey: ['stats-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <div className="grid xl:grid-cols-2">
        <Section title={copy.sections.profitEfficiency}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={profitSeries}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(value) => `${value}×`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale, 'ratio')} />
                <ReferenceLine y={1} stroke="#e11d48" strokeDasharray="5 4" />
                <ActualOpenLine
                  dataKey="profitXBeforeReturns"
                  name="Before returns"
                  stroke="#64748b"
                  strokeWidth={1.7}
                />
                <ActualOpenLine
                  dataKey="profitX"
                  name="After returns"
                  stroke="#7c3aed"
                  strokeWidth={2.4}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section title={copy.sections.creativeFatigue}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={data.daily}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis yAxisId="cpm" tickLine={false} axisLine={false} width={38} fontSize={11} />
                <YAxis
                  yAxisId="ctr"
                  orientation="right"
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar yAxisId="cpm" dataKey="cpmEur" name="CPM EUR" fill="#d97706" opacity={0.45} />
                <Line
                  yAxisId="ctr"
                  type="monotone"
                  dataKey="outboundCtrPct"
                  name={copy.columns.outboundCtr}
                  stroke="#2563eb"
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
      {data.summary.videoPlays > 0 ? (
        <Section title={copy.sections.creativeResponse}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.7fr)]">
            <Funnel
              rows={[
                { name: 'Played', value: data.summary.videoPlays },
                { name: '25%', value: data.summary.videoP25Watched },
                { name: '50%', value: data.summary.videoP50Watched },
                { name: '75%', value: data.summary.videoP75Watched },
                { name: 'Completed', value: data.summary.videoP100Watched },
              ]}
              locale={locale}
            />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-6 text-sm lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
              <div>
                <dt className="text-muted-foreground">Play rate</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.videoPlayRatePct)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completion</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.videoCompletionRatePct)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Average watch</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatNumber(locale, data.summary.videoAverageWatchSeconds)} s
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Outbound CTR</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.outboundCtrPct)}
                </dd>
              </div>
            </dl>
          </div>
        </Section>
      ) : null}
      <Section title={copy.sections.paidFunnel}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.7fr)]">
          <Funnel rows={data.funnel} locale={locale} />
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-6 text-sm lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
            <div>
              <dt className="text-muted-foreground">Confirmation rate</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.confirmationRatePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Click → page</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.clickToPageRatePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Meta purchases</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatNumber(locale, data.summary.metaPurchases)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">First-party orders</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatNumber(locale, data.summary.bricOrders)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Exact ad-ID coverage</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.exactAdAttributionCoveragePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Outcome maturity</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.outcomeMaturityPct)}
              </dd>
            </div>
          </dl>
        </div>
      </Section>
      <Section title="Campaign maturation">
        {maturationCampaigns.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {maturationCampaigns.map((campaign, index) => (
                <span
                  key={campaign.campaignId}
                  className="inline-flex max-w-56 items-center gap-1.5"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: chartColors[index] }}
                  />
                  <span className="truncate">
                    {campaignNames.get(campaign.campaignId) ?? campaign.campaignId}
                  </span>
                </span>
              ))}
            </div>
            <ChartFrame className="h-[20rem]">
              <ResponsiveChart width="100%" height="100%">
                <ComposedChart data={maturationChart}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => `D${value}`}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    fontSize={11}
                    domain={[0, 100]}
                  />
                  <Tooltip {...chartTooltip(locale, 'percent')} />
                  {maturationCampaigns.map((campaign, index) => (
                    <Line
                      key={campaign.campaignId}
                      type="monotone"
                      dataKey={`series${index}`}
                      name={campaignNames.get(campaign.campaignId) ?? campaign.campaignId}
                      stroke={chartColors[index]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveChart>
            </ChartFrame>
          </>
        ) : (
          <p className="border-y border-border/60 py-6 text-sm text-muted-foreground">
            {copy.noData}
          </p>
        )}
      </Section>
      <Section
        title={copy.sections.hierarchy}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-muted/55 p-1">
              {(['campaign', 'adset', 'ad'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    level === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                  onClick={() => {
                    setLevel(key);
                    setInspectedId(null);
                  }}
                >
                  {copy.modes[key]}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.sync.canSyncActiveRange || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {syncMutation.isPending ? copy.syncing : copy.syncMeta}
            </Button>
          </div>
        }
      >
        {selectedIds.length ? (
          <div className="mb-5 border-b border-border/55 pb-5">
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {selectedIds.map((id, index) => (
                <span key={id} className="inline-flex max-w-52 items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: chartColors[index] }}
                  />
                  <span className="truncate">
                    {entities.find((entity) => entity.id === id)?.name ?? id}
                  </span>
                </span>
              ))}
            </div>
            <ChartFrame className="h-[15rem]">
              <ResponsiveChart width="100%" height="100%">
                <ComposedChart data={comparison}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatDate(locale, String(value))}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    fontSize={11}
                  />
                  <Tooltip {...chartTooltip(locale, 'money')} />
                  {selectedIds.map((id, index) => (
                    <Bar
                      key={id}
                      dataKey={`series${index}`}
                      stackId="spend"
                      name={entities.find((entity) => entity.id === id)?.name ?? id}
                      fill={chartColors[index]}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveChart>
            </ChartFrame>
          </div>
        ) : null}
        <DenseTable>
          <TableHead>
            <tr>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">{copy.compare}</span>
              </th>
              <th className="px-3 py-2 text-start">{copy.columns.name}</th>
              <th className="px-3 py-2 text-end">{copy.columns.spend}</th>
              <th className="px-3 py-2 text-end">{copy.columns.outboundCtr}</th>
              <th className="px-3 py-2 text-end">{copy.columns.posted}</th>
              <th className="px-3 py-2 text-end">Cost / posted</th>
              <th className="px-3 py-2 text-end">Cost / delivered</th>
              <th className="px-3 py-2 text-end">Cost / paid</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {entities.slice(0, 100).map((entity) => {
              const selected = selectedIds.includes(entity.id);
              return (
                <tr
                  key={entity.id}
                  className="cursor-pointer hover:bg-muted/25"
                  onClick={() => setInspectedId(entity.id)}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={`${copy.compare} ${entity.name}`}
                      className={cn(
                        'grid size-5 place-items-center rounded border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedIds((current) =>
                          selected
                            ? current.filter((id) => id !== entity.id)
                            : current.length < 6
                              ? [...current, entity.id]
                              : current,
                        );
                      }}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </button>
                  </td>
                  <td className="max-w-72 px-3 py-2.5">
                    <p className="truncate font-medium">{entity.name}</p>
                    {level !== 'campaign' ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {entity.campaignName}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.adCostDzd)}
                    {entity.outcomeSpendCoveragePct != null ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {formatPercent(locale, entity.outcomeSpendCoveragePct)} outcome window
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, entity.outboundCtrPct)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, entity.postedOrders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerPostedDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerDeliveredDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerPaidDzd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DenseTable>
      </Section>
      <Section title={copy.sections.trackingHealth}>
        <details className="border-y border-border/60 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {copy.sections.trackingHealth} ·{' '}
            {formatNumber(
              locale,
              data.trackingHealth.events.reduce((sum, row) => sum + row.total, 0),
            )}{' '}
            events
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trackingHealth.events.slice(0, 12).map((event) => (
              <div key={event.name}>
                <p className="text-xs text-muted-foreground">{event.name}</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {formatNumber(locale, event.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  CAPI {formatNumber(locale, event.capiDelivered)} /{' '}
                  {formatNumber(locale, event.capiFailed)} failed
                </p>
              </div>
            ))}
          </div>
        </details>
      </Section>
      <SidePanel
        open={Boolean(inspected)}
        onOpenChange={(open) => {
          if (!open) setInspectedId(null);
        }}
        title={inspected?.name ?? ''}
        description={inspected?.campaignName ?? undefined}
        closeLabel={copy.close}
      >
        {inspected ? (
          <div className="divide-y divide-border/60">
            {[
              ['Meta spend', formatEur(locale, inspected.spendEur)],
              ['Ad cost DZD', formatMoney(locale, inspected.adCostDzd)],
              ['Outcome-window cost', formatMoney(locale, inspected.attributedAdCostDzd)],
              ['Outcome spend coverage', formatPercent(locale, inspected.outcomeSpendCoveragePct)],
              ['Impressions', formatNumber(locale, inspected.impressions)],
              ['Outbound clicks', formatNumber(locale, inspected.outboundClicks)],
              ['Unique outbound', formatNumber(locale, inspected.uniqueOutboundClicks)],
              ['Outbound CTR', formatPercent(locale, inspected.outboundCtrPct)],
              ['Landing views', formatNumber(locale, inspected.landingPageViews)],
              ['Landing-view rate', formatPercent(locale, inspected.landingViewRatePct)],
              ['Video plays', formatNumber(locale, inspected.videoPlays)],
              ['Video completion', formatPercent(locale, inspected.videoCompletionRatePct)],
              [
                'Average watch',
                inspected.videoAverageWatchSeconds == null
                  ? '—'
                  : `${formatNumber(locale, inspected.videoAverageWatchSeconds)} s`,
              ],
              ['Quality ranking', inspected.qualityRanking ?? '—'],
              ['Engagement ranking', inspected.engagementRateRanking ?? '—'],
              ['Conversion ranking', inspected.conversionRateRanking ?? '—'],
              ['Meta purchases', formatNumber(locale, inspected.metaPurchases)],
              ['Bric orders', formatNumber(locale, inspected.bricOrders)],
              ['Confirmed', formatNumber(locale, inspected.confirmedOrders)],
              ['Posted', formatNumber(locale, inspected.postedOrders)],
              ['Delivered', formatNumber(locale, inspected.deliveredOrders)],
              ['Paid', formatNumber(locale, inspected.paidOrders)],
              ['Returned', formatNumber(locale, inspected.returnedOrders)],
              ['Cost / posted', formatMoney(locale, inspected.costPerPostedDzd)],
              ['Cost / delivered', formatMoney(locale, inspected.costPerDeliveredDzd)],
              ['Cost / paid', formatMoney(locale, inspected.costPerPaidDzd)],
              ['Projected Profit ×', formatRatio(locale, inspected.projectedProfitX)],
              ['Paid Profit ×', formatRatio(locale, inspected.paidProfitX)],
              ['Profit coverage', formatPercent(locale, inspected.profitCoveragePct)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="text-muted-foreground">{label}</span>
                <strong className="tabular-nums">{value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}

function ReturnEvidence({
  returns,
  copy,
  locale,
}: {
  returns: DataOf<'fulfillment'>['returns'];
  copy: Analytics2Copy;
  locale: string;
}) {
  return (
    <div className="grid divide-y divide-border/50 border-y border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.planning}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.planningRatePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Manual model input</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.mature}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.mature.ratePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNumber(locale, returns.mature.terminal)} terminal /{' '}
          {formatNumber(locale, returns.mature.eligibleOrders)} eligible ·{' '}
          {formatPercent(locale, returns.mature.terminalCoveragePct)} resolved
        </p>
        {returns.mature.cohortStartDate && returns.mature.cohortEndDate ? (
          <p className="mt-1 text-[11px] text-muted-foreground/75">
            {formatDate(locale, returns.mature.cohortStartDate)}–
            {formatDate(locale, returns.mature.cohortEndDate)} posting cohorts
          </p>
        ) : null}
      </div>
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.terminal}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.allTerminal.ratePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNumber(locale, returns.allTerminal.terminal)} terminal orders
        </p>
      </div>
    </div>
  );
}

function FulfillmentView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'fulfillment'>;
  copy: Analytics2Copy;
  locale: string;
}) {
  type StateRow = {
    status: string;
    phase: string;
    orders: number;
    sharePct: number;
    staleOrders: number;
  };
  type AttemptRow = { band: string; outcome: string; orders: number };
  const phases = useMemo(() => {
    const result = new Map<string, number>();
    data.states
      .filter((row: StateRow) => row.phase !== 'untracked')
      .forEach((row: StateRow) => result.set(row.phase, (result.get(row.phase) ?? 0) + row.orders));
    return [...result.entries()].map(([key, value]) => ({ key, value }));
  }, [data.states]);
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section title={copy.sections.deliveryPipeline}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
          <Funnel rows={phases} locale={locale} />
          <ReturnEvidence returns={data.returns} copy={copy} locale={locale} />
        </div>
      </Section>
      <Section title={copy.sections.cashPipeline}>
        <CashPipeline rows={data.cashPipeline} copy={copy} locale={locale} />
      </Section>
      <div>
        <Section title={copy.sections.shipmentStates}>
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.status}</th>
                <th className="px-3 py-2 text-end">{copy.columns.orders}</th>
                <th className="px-3 py-2 text-end">{copy.columns.share}</th>
                <th className="px-3 py-2 text-end">{copy.columns.stale}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.states.map((row: StateRow) => (
                <tr key={row.status}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{row.status.replaceAll('_', ' ')}</p>
                    <p className="text-xs capitalize text-muted-foreground">{row.phase}</p>
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.orders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.sharePct)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end tabular-nums',
                      row.staleOrders > 0 && 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {formatNumber(locale, row.staleOrders)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <div className="grid xl:grid-cols-2">
        <Section title={copy.sections.cohorts}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={[...data.cohorts].reverse()}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
                <Tooltip {...chartTooltip(locale)} />
                <Bar dataKey="paid" stackId="outcome" name={copy.columns.paid} fill="#0f766e" />
                <Bar
                  dataKey="returned"
                  stackId="outcome"
                  name={copy.columns.returned}
                  fill="#e11d48"
                />
                <Bar
                  dataKey="active"
                  stackId="outcome"
                  name="Active"
                  fill="#d97706"
                  opacity={0.65}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section title={copy.sections.attempts}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart
                data={['0', '1', '2', '3', '4+'].map((band) => ({
                  band: band === '0' ? 'No event' : band,
                  paid:
                    data.attempts.find(
                      (row: AttemptRow) => row.band === band && row.outcome === 'paid',
                    )?.orders ?? 0,
                  returned:
                    data.attempts.find(
                      (row: AttemptRow) => row.band === band && row.outcome === 'returned',
                    )?.orders ?? 0,
                }))}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis dataKey="band" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
                <Tooltip {...chartTooltip(locale)} />
                <Bar dataKey="paid" name={copy.columns.paid} fill="#0f766e" />
                <Bar dataKey="returned" name={copy.columns.returned} fill="#e11d48" />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
    </>
  );
}

function StorefrontView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'storefront'>;
  filters: Analytics2Payload['filters'];
  copy: Analytics2Copy;
  locale: string;
}) {
  const detailParams = useMemo(() => {
    const params = new URLSearchParams({ range: filters.range, grain: filters.grain });
    if (filters.range === 'custom' && filters.startDate) params.set('startDate', filters.startDate);
    if (filters.range === 'custom') params.set('endDate', filters.endDate);
    return params;
  }, [filters.endDate, filters.grain, filters.range, filters.startDate]);
  const detailsQuery = useQuery({
    queryKey: [
      'stats-storefront-details',
      filters.range,
      filters.startDate,
      filters.endDate,
      filters.grain,
    ],
    queryFn: ({ signal }) =>
      request<{
        data: Pick<
          DataOf<'storefront'>,
          | 'metrics'
          | 'funnel'
          | 'paths'
          | 'trend'
          | 'acquisitionSources'
          | 'vitals'
          | 'landingPages'
          | 'aiAssistant'
        >;
      }>(`/api/stats/storefront-details?${detailParams.toString()}`, { signal }),
    staleTime: 30_000,
  });
  const viewData = { ...data, ...(detailsQuery.data?.data ?? {}) };
  const detailedMetrics = new Map(
    detailsQuery.data?.data.metrics.map((item) => [item.key, item]) ?? [],
  );
  const metrics = data.metrics.map((item) => detailedMetrics.get(item.key) ?? item);
  const funnelValues = new Map(
    viewData.funnel.map((row: { name: string; value: number }) => [row.name, row.value]),
  );
  const productSessions = funnelValues.get('Product-view sessions') ?? 0;
  const cartSessions = funnelValues.get('Cart sessions') ?? 0;
  const checkoutSessions = funnelValues.get('Checkout sessions') ?? 0;
  const submittedSessions = funnelValues.get('Submitted-order sessions') ?? 0;
  return (
    <>
      <MetricStrip metrics={metrics} copy={copy} locale={locale} />
      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.8fr)]">
        <Section title={copy.sections.siteTrend}>
          <ChartFrame className="h-[23rem]">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={viewData.trend}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  yAxisId="traffic"
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  fontSize={11}
                />
                <YAxis
                  yAxisId="outcome"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale)} />
                <Area
                  yAxisId="traffic"
                  type="monotone"
                  dataKey="sessions"
                  name={copy.metrics.sessions}
                  fill="#2563eb"
                  fillOpacity={0.12}
                  stroke="#2563eb"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="outcome"
                  type="monotone"
                  dataKey="purchases"
                  name={copy.metrics.purchases}
                  stroke="#0f766e"
                  strokeWidth={2.3}
                  dot={false}
                />
                <Line
                  yAxisId="outcome"
                  type="monotone"
                  dataKey="errors"
                  name="Errors"
                  stroke="#e11d48"
                  strokeWidth={1.6}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section title={copy.sections.siteFunnel}>
          <Funnel
            rows={viewData.funnel.map((row: { name: string; value: number }) => row)}
            locale={locale}
          />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border/50 pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">Product-view → cart sessions</p>
              <p className="mt-1 text-lg font-semibold">
                {formatPercent(
                  locale,
                  productSessions ? (cartSessions / productSessions) * 100 : null,
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Checkout → submitted order</p>
              <p className="mt-1 text-lg font-semibold">
                {formatPercent(
                  locale,
                  checkoutSessions ? (submittedSessions / checkoutSessions) * 100 : null,
                )}
              </p>
            </div>
          </div>
        </Section>
      </div>
      <div className="grid xl:grid-cols-2">
        <Section
          title={copy.sections.paths}
          description={`${formatDate(locale, viewData.paths.coverageStartDate, false)} – ${formatDate(locale, viewData.paths.coverageEndDate, false)} raw-event window`}
        >
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">From</th>
                <th className="px-3 py-2 text-start">To</th>
                <th className="px-3 py-2 text-end">{copy.columns.sessions}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {viewData.paths.rows.map((row: { from: string; to: string; sessions: number }) => (
                <tr key={`${row.from}-${row.to}`}>
                  <td className="max-w-52 truncate px-3 py-2.5 font-medium">{row.from}</td>
                  <td className="max-w-52 truncate px-3 py-2.5 text-muted-foreground">{row.to}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.sessions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
        <Section title={copy.sections.searches}>
          <div className="divide-y divide-border/50 border-y border-border/60">
            {viewData.searches
              .slice(0, 20)
              .map((row: { term: string; searches: number; zeroResults: number }) => (
                <div
                  key={row.term}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">{row.term || '(empty)'}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(locale, row.searches)}
                  </span>
                  <span
                    className={cn(
                      'min-w-16 text-end tabular-nums',
                      row.zeroResults > 0 && 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {formatNumber(locale, row.zeroResults)} zero
                  </span>
                </div>
              ))}
          </div>
        </Section>
      </div>
      <Section title={copy.sections.landingPages}>
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.name}</th>
              <th className="px-3 py-2 text-start">{copy.columns.status}</th>
              <th className="px-3 py-2 text-end">{copy.columns.sessions}</th>
              <th className="px-3 py-2 text-end">{copy.columns.views}</th>
              <th className="px-3 py-2 text-end">{copy.columns.carts}</th>
              <th className="px-3 py-2 text-end">{copy.metrics.purchases}</th>
              <th className="px-3 py-2 text-end">{copy.columns.conversion}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {viewData.landingPages.pages
              .slice(0, 50)
              .map(
                (page: {
                  id: number;
                  slug: string;
                  locale: string;
                  status: string;
                  product: string;
                  sessions: number;
                  productViews: number;
                  addToCarts: number;
                  purchases: number;
                  conversionRate: number;
                }) => (
                  <tr key={page.id}>
                    <td className="max-w-72 px-3 py-2.5">
                      <p className="truncate font-medium">/{page.slug}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {page.product} · {page.locale}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{page.status}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, page.sessions)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, page.productViews)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, page.addToCarts)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, page.purchases)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, page.conversionRate)}
                    </td>
                  </tr>
                ),
              )}
          </tbody>
        </DenseTable>
      </Section>
      <div className="grid xl:grid-cols-3">
        <Section title={copy.sections.experience} className="xl:col-span-2">
          <div className="grid divide-y divide-border/50 border-y border-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {viewData.vitals.map(
              (vital: {
                name: string;
                samples: number;
                average: number;
                good: number;
                needsImprovement: number;
                poor: number;
              }) => (
                <div key={vital.name} className="px-4 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{vital.name}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatNumber(locale, vital.average)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(locale, vital.samples)} samples ·{' '}
                    {formatNumber(locale, vital.poor)} poor
                  </p>
                </div>
              ),
            )}
          </div>
          <div className="mt-5 divide-y divide-border/45">
            {viewData.acquisitionSources
              .slice(0, 10)
              .map(
                (source: {
                  name: string;
                  sessions: number;
                  orders: number;
                  successfulOrders: number;
                  conversionRate: number;
                }) => (
                  <div
                    key={source.name}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-5 py-2.5 text-sm"
                  >
                    <span className="font-medium">{source.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(locale, source.sessions)} sessions
                    </span>
                    <span className="min-w-16 text-end font-medium tabular-nums">
                      {formatPercent(locale, source.conversionRate)}
                    </span>
                  </div>
                ),
              )}
          </div>
        </Section>
        <Section title="AI-assisted shopping">
          <dl className="divide-y divide-border/50 border-y border-border/60 text-sm">
            {[
              ['Opens', viewData.aiAssistant.opens],
              ['Messages', viewData.aiAssistant.messages],
              ['Result clicks', viewData.aiAssistant.resultClicks],
              ['Influenced orders', viewData.aiAssistant.influencedOrders],
              ['Confirmed', viewData.aiAssistant.confirmedOrders],
              ['Paid', viewData.aiAssistant.paidOrders],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between py-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatNumber(locale, Number(value))}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </>
  );
}

type SearchOpportunity = DataOf<'search'>['opportunities'][number];
type SearchPage = DataOf<'search'>['pages'][number];

function SearchVisibilityView({
  data,
  filters,
  reviewClock,
  copy,
  locale,
}: {
  data: DataOf<'search'>;
  filters: Analytics2Payload['filters'];
  reviewClock: boolean;
  copy: Analytics2Copy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [selectedQuery, setSelectedQuery] = useState<SearchOpportunity | null>(null);
  const [selectedPage, setSelectedPage] = useState<SearchPage | null>(null);
  const sync = useMutation({
    mutationFn: () =>
      request<{ result: { since: string; until: string } }>('/api/stats/search-console/sync', {
        method: 'POST',
        ...(reviewClock && filters.startDate
          ? { body: JSON.stringify({ since: filters.startDate, until: filters.endDate }) }
          : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stats-workspace', 'search'] });
      toast.success('Google Search data synchronized');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Sync failed'),
  });
  const inspectionIssues = data.indexHealth.issues;
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.searchTrend}
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {sync.isPending ? copy.syncing : 'Sync Google'}
          </Button>
        }
      >
        <div>
          <ChartFrame className="h-[22rem]">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={data.trend}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  yAxisId="impressions"
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  fontSize={11}
                />
                <YAxis
                  yAxisId="clicks"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar
                  yAxisId="impressions"
                  dataKey="impressions"
                  name={copy.metrics.searchImpressions}
                  fill="#7c3aed"
                  opacity={0.28}
                />
                <Line
                  yAxisId="clicks"
                  type="monotone"
                  dataKey="clicks"
                  name={copy.metrics.searchClicks}
                  stroke="#0f766e"
                  strokeWidth={2.25}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </div>
      </Section>

      <Section title={copy.sections.searchOpportunities}>
        {data.opportunities.length ? (
          <>
            <div className="divide-y divide-border/50 border-y border-border/60 md:hidden">
              {data.opportunities.slice(0, 18).map((row: SearchOpportunity) => (
                <button
                  key={row.query}
                  type="button"
                  className="block w-full py-3 text-start"
                  onClick={() => setSelectedQuery(row)}
                >
                  <span className="line-clamp-2 text-sm font-medium">{row.query}</span>
                  <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatNumber(locale, row.impressions)} impressions</span>
                    <span>position {formatNumber(locale, row.position)}</span>
                    <span className="font-medium text-foreground">
                      +{formatNumber(locale, row.potentialClicks)} clicks
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <DenseTable className="hidden md:block">
              <TableHead>
                <tr>
                  <th className="px-3 py-2 text-start">{copy.columns.query}</th>
                  <th className="px-3 py-2 text-start">Opportunity</th>
                  <th className="px-3 py-2 text-end">{copy.columns.impressions}</th>
                  <th className="px-3 py-2 text-end">{copy.columns.clicks}</th>
                  <th className="px-3 py-2 text-end">{copy.columns.ctr}</th>
                  <th className="px-3 py-2 text-end">{copy.columns.position}</th>
                  <th className="px-3 py-2 text-end">{copy.columns.potential}</th>
                </tr>
              </TableHead>
              <tbody className="divide-y divide-border/45">
                {data.opportunities.map((row: SearchOpportunity) => (
                  <tr
                    key={row.query}
                    className="cursor-pointer hover:bg-muted/35"
                    onClick={() => setSelectedQuery(row)}
                  >
                    <td className="max-w-md px-3 py-2.5">
                      <p className="truncate font-medium">{row.query}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.pages} ranking pages · {row.branded ? 'brand' : 'discovery'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.opportunity === 'strikingDistance'
                        ? 'Near page one'
                        : row.opportunity === 'ctrGap'
                          ? 'CTR gap'
                          : 'Content gap'}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, row.impressions)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, row.clicks)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, row.ctrPct)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, row.position)}
                    </td>
                    <td className="px-3 py-2.5 text-end font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{formatNumber(locale, row.potentialClicks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DenseTable>
          </>
        ) : (
          <p className="border-y border-border/60 py-5 text-sm text-muted-foreground">
            {copy.noData}
          </p>
        )}
      </Section>

      <Section
        title={copy.sections.searchPages}
        description="Landing pages as Google sees them. Select a row to inspect the queries creating its visibility."
      >
        <div className="divide-y divide-border/50 border-y border-border/60 md:hidden">
          {data.pages.slice(0, 40).map((row: SearchPage) => (
            <button
              key={row.page}
              type="button"
              className="block w-full py-3 text-start"
              onClick={() => setSelectedPage(row)}
            >
              <span className="block truncate text-sm font-medium">{row.path}</span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatNumber(locale, row.clicks)} clicks</span>
                <span>{formatNumber(locale, row.impressions)} impressions</span>
                <span>position {formatNumber(locale, row.position)}</span>
              </span>
            </button>
          ))}
        </div>
        <DenseTable className="hidden md:block">
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.page}</th>
              <th className="px-3 py-2 text-end">{copy.columns.clicks}</th>
              <th className="px-3 py-2 text-end">{copy.columns.impressions}</th>
              <th className="px-3 py-2 text-end">{copy.columns.ctr}</th>
              <th className="px-3 py-2 text-end">{copy.columns.position}</th>
              <th className="px-3 py-2 text-end">Queries</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.pages.slice(0, 100).map((row: SearchPage) => (
              <tr
                key={row.page}
                className="cursor-pointer hover:bg-muted/35"
                onClick={() => setSelectedPage(row)}
              >
                <td className="max-w-lg px-3 py-2.5">
                  <p className="truncate font-medium">{row.path}</p>
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, row.clicks)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, row.impressions)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, row.ctrPct)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, row.position)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, row.queries)}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>

      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <Section title={copy.sections.searchMix}>
          <div className="grid gap-7 sm:grid-cols-2">
            {[
              ['Devices', data.devices, 'device'],
              ['Countries', data.countries.slice(0, 8), 'country'],
            ].map(([title, rows, field]) => (
              <div key={String(title)}>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {String(title)}
                </p>
                <div className="mt-2 divide-y divide-border/50 border-y border-border/60">
                  {(rows as Array<Record<string, unknown>>).map((row) => (
                    <div
                      key={String(row[field as string])}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 py-2.5 text-sm"
                    >
                      <span className="capitalize">
                        {String(row[field as string]).replaceAll('_', ' ')}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatNumber(locale, Number(row.clicks))}
                      </span>
                      <span className="min-w-14 text-end tabular-nums">
                        {formatPercent(locale, Number(row.ctrPct))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {data.appearances.length ? (
            <div className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Search appearance
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 border-y border-border/60 py-3 text-sm">
                {data.appearances.map((row) => (
                  <span key={row.appearance}>
                    <strong>{row.appearance.replaceAll('_', ' ')}</strong>{' '}
                    <span className="text-muted-foreground">
                      {formatNumber(locale, row.clicks)} clicks ·{' '}
                      {formatNumber(locale, row.impressions)} impressions
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
        <Section title={copy.sections.indexHealth}>
          <div className="divide-y divide-border/50 border-y border-border/60">
            {data.indexHealth.sitemaps.map((sitemap) => (
              <div key={sitemap.path} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">Sitemap</span>
                  <strong className="tabular-nums">
                    {formatNumber(locale, sitemap.submittedUrls)} URLs
                  </strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sitemap.errors} errors · {sitemap.warnings} warnings · downloaded{' '}
                  {sitemap.lastDownloadedAt
                    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        new Date(sitemap.lastDownloadedAt),
                      )
                    : '—'}
                </p>
              </div>
            ))}
            <div className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Inspected sample</span>
                <strong>{data.indexHealth.inspections.length}</strong>
              </div>
              <p
                className={cn(
                  'mt-1 text-xs',
                  inspectionIssues.length
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-muted-foreground',
                )}
              >
                {inspectionIssues.length
                  ? `${inspectionIssues.length} pages need review`
                  : 'No actionable issue in the current sample'}
              </p>
            </div>
          </div>
          {inspectionIssues.length ? (
            <div className="mt-3 divide-y divide-border/45">
              {inspectionIssues.slice(0, 8).map((issue) => (
                <div key={issue.url} className="py-2 text-xs">
                  <p className="truncate font-medium">{issue.path}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {issue.coverageState ?? issue.verdict}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      </div>

      <SidePanel
        open={Boolean(selectedQuery)}
        onOpenChange={(open) => {
          if (!open) setSelectedQuery(null);
        }}
        title={selectedQuery?.query ?? ''}
        description="Search opportunity evidence"
        closeLabel={copy.close}
      >
        {selectedQuery ? (
          <div className="space-y-6 px-5 py-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Current CTR</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatPercent(locale, selectedQuery.ctrPct)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comparable CTR</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatPercent(locale, selectedQuery.benchmarkCtrPct)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Ranking pages
              </p>
              <div className="mt-2 divide-y divide-border/50 border-y border-border/60">
                {selectedQuery.topPages.map((page) => (
                  <div key={page.page} className="py-3">
                    <p className="break-all text-sm font-medium">{page.path}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(locale, page.clicks)} clicks ·{' '}
                      {formatNumber(locale, page.impressions)} impressions
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </SidePanel>
      <SidePanel
        open={Boolean(selectedPage)}
        onOpenChange={(open) => {
          if (!open) setSelectedPage(null);
        }}
        title={selectedPage?.path ?? ''}
        description="Google landing-page evidence"
        closeLabel={copy.close}
      >
        {selectedPage ? (
          <div className="space-y-5 px-5 py-5">
            <a
              href={selectedPage.page}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open public page
            </a>
            <div className="divide-y divide-border/50 border-y border-border/60">
              {selectedPage.topQueries.map((query) => (
                <div key={query.query} className="py-3">
                  <p className="text-sm font-medium">{query.query}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(locale, query.clicks)} clicks ·{' '}
                    {formatNumber(locale, query.impressions)} impressions
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}

type CatalogProduct = DataOf<'catalog'>['products'][number];
type CatalogCustomer = DataOf<'catalog'>['customers']['rows'][number];
type ProductScatterPoint = CatalogProduct & {
  x: number;
  y: number;
  z: number;
  resolvedOrders: number;
  outcomeCoveragePct: number;
};

function ProductScatterTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ProductScatterPoint }>;
  locale: string;
}) {
  const product = payload?.[0]?.payload;
  if (!active || !product) return null;
  return (
    <div className="min-w-56 border border-border/70 bg-background/95 p-3 text-xs shadow-lg">
      <p className="max-w-72 font-semibold leading-5">{product.title}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-muted-foreground">
        <span>Product views</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.viewCount)}
        </strong>
        <span>Terminal paid</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatPercent(locale, product.terminalPaidRatePct)}
        </strong>
        <span>Paid / returned</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.paidOrders)} /{' '}
          {formatNumber(locale, product.returnedOrders)}
        </strong>
        <span>Still active</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.activeOrders)}
        </strong>
      </div>
    </div>
  );
}

function CatalogView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'catalog'>;
  copy: Analytics2Copy;
  locale: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    if (!term) return data.products;
    return data.products.filter((product: CatalogProduct) =>
      `${product.title} ${product.sku ?? ''} ${product.categoryName ?? ''} ${product.brandName ?? ''}`
        .toLocaleLowerCase(locale)
        .includes(term),
    );
  }, [data.products, locale, search]);
  const selected =
    data.products.find((product: CatalogProduct) => product.id === selectedId) ?? null;
  const scatter = filtered
    .map((product: CatalogProduct): ProductScatterPoint => {
      const resolvedOrders = product.paidOrders + product.returnedOrders;
      const measuredOrders = resolvedOrders + product.activeOrders;
      return {
        ...product,
        x: product.viewCount ?? 0,
        y: product.terminalPaidRatePct ?? 0,
        z: resolvedOrders,
        resolvedOrders,
        outcomeCoveragePct: measuredOrders > 0 ? (resolvedOrders / measuredOrders) * 100 : 0,
      };
    })
    .filter(
      (product: ProductScatterPoint) =>
        product.x > 0 &&
        product.terminalPaidRatePct != null &&
        product.resolvedOrders >= 10 &&
        product.outcomeCoveragePct >= 50,
    )
    .sort(
      (left: ProductScatterPoint, right: ProductScatterPoint) =>
        right.resolvedOrders - left.resolvedOrders,
    )
    .slice(0, 80);
  const resolvedPaidOrders = scatter.reduce(
    (sum: number, product: ProductScatterPoint) => sum + product.paidOrders,
    0,
  );
  const resolvedOrders = scatter.reduce(
    (sum: number, product: ProductScatterPoint) => sum + product.resolvedOrders,
    0,
  );
  const portfolioPaidRatePct =
    resolvedOrders > 0 ? (resolvedPaidOrders / resolvedOrders) * 100 : null;
  const minimumPaidRatePct = scatter.length
    ? Math.min(...scatter.map((product: ProductScatterPoint) => product.y))
    : 0;
  const paidRateDomainMinimum = Math.max(0, Math.floor(minimumPaidRatePct / 10) * 10 - 10);
  const paidRateTicks = Array.from(
    new Set(
      [paidRateDomainMinimum, 50, 75, 100].filter(
        (value) => value >= paidRateDomainMinimum && value <= 100,
      ),
    ),
  );
  const minimumViews = scatter.length
    ? Math.min(...scatter.map((product: ProductScatterPoint) => product.x))
    : 1;
  const maximumViews = scatter.length
    ? Math.max(...scatter.map((product: ProductScatterPoint) => product.x))
    : 1;
  const viewDomain: [number, number] = [
    Math.max(1, minimumViews * 0.8),
    Math.max(maximumViews * 1.2, minimumViews + 1),
  ];
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.products}
        action={
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-9"
              placeholder="Search product, SKU or category"
            />
          </label>
        }
      >
        <div className="mb-5" data-product-outcome-plot>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 text-[11px] text-muted-foreground sm:px-3">
            <span>Views →</span>
            <span>Paid outcome ↑</span>
            <span>Bubble · resolved orders</span>
            {portfolioPaidRatePct != null ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-teal-700" /> Above{' '}
                  {formatPercent(locale, portfolioPaidRatePct)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-600" /> Below{' '}
                  {formatPercent(locale, portfolioPaidRatePct)}
                </span>
              </>
            ) : null}
          </div>
          {scatter.length ? (
            <ChartFrame className="h-[20rem]">
              <ResponsiveChart width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 34, bottom: 12, left: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeOpacity={0.45} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={copy.columns.views}
                    scale="log"
                    domain={viewDomain}
                    tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Terminal paid rate"
                    domain={[paidRateDomainMinimum, 105]}
                    ticks={paidRateTicks}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    fontSize={11}
                  />
                  <ZAxis type="number" dataKey="z" range={[42, 300]} />
                  {portfolioPaidRatePct != null ? (
                    <ReferenceLine
                      y={portfolioPaidRatePct}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.65}
                    />
                  ) : null}
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={<ProductScatterTooltip locale={locale} />}
                  />
                  <Scatter data={scatter} fill="#7c3aed">
                    {scatter.map((row: ProductScatterPoint) => (
                      <Cell
                        key={row.id}
                        fill={
                          portfolioPaidRatePct != null && row.y >= portfolioPaidRatePct
                            ? '#0f766e'
                            : '#d97706'
                        }
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveChart>
            </ChartFrame>
          ) : (
            <div className="flex h-48 items-center justify-center border-y border-border/50 text-sm text-muted-foreground">
              Not enough resolved product outcomes for a reliable comparison.
            </div>
          )}
        </div>
        <div className="divide-y divide-border/50 border-y border-border/60 sm:hidden">
          {filtered.slice(0, 12).map((product: CatalogProduct) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedId(product.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 text-start"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{product.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {formatNumber(locale, product.postedUnits)} posted ·{' '}
                  {formatPercent(locale, product.terminalPaidRatePct)} terminal paid
                </span>
              </span>
              <span className="text-end">
                <span className="block text-sm font-semibold tabular-nums">
                  {formatMoney(locale, product.projectedContributionDzd)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {formatHours(locale, product.deliveryMedianHours)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <DenseTable className="hidden max-h-[42rem] overflow-y-auto sm:block">
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.name}</th>
              <th className="px-3 py-2 text-end">{copy.columns.views}</th>
              <th className="px-3 py-2 text-end">Posted units</th>
              <th className="px-3 py-2 text-end">{copy.columns.paid}</th>
              <th className="px-3 py-2 text-end">Terminal paid</th>
              <th className="px-3 py-2 text-end">Projected contribution</th>
              <th className="px-3 py-2 text-end">Delivery</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {filtered.slice(0, 60).map((product: CatalogProduct) => (
              <tr
                key={product.id}
                className="cursor-pointer hover:bg-muted/25"
                onClick={() => setSelectedId(product.id)}
              >
                <td className="max-w-80 px-3 py-2.5">
                  <p className="truncate font-medium">{product.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {product.sku ?? 'No SKU'} · {product.categoryName ?? 'Uncategorized'}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, product.viewCount)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, product.postedUnits)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, product.paidOrders)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, product.terminalPaidRatePct)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-end font-medium tabular-nums',
                    product.projectedContributionDzd != null &&
                      product.projectedContributionDzd < 0 &&
                      'text-rose-600',
                  )}
                >
                  {formatMoney(locale, product.projectedContributionDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatHours(locale, product.deliveryMedianHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>
      <Section title={copy.sections.geography}>
        <AlgeriaWilayaMap rows={data.geography.wilayas} locale={locale} />
        {data.geography.metaRegions.length ? (
          <div className="mt-6 border-y border-border/60">
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Meta-reported regions
              </p>
              <p className="text-[11px] text-muted-foreground">
                Aggregate media geography · not joined to customer wilayas
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              {data.geography.metaRegions
                .slice(0, 8)
                .map((region: DataOf<'catalog'>['geography']['metaRegions'][number]) => (
                  <div key={region.name} className="border-t border-e border-border/45 px-3 py-3">
                    <p className="truncate text-sm font-medium">{region.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatEur(locale, region.spendEur)} ·{' '}
                      {formatPercent(locale, region.outboundCtrPct)} outbound CTR
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">Wilaya</th>
                <th className="px-3 py-2 text-end">Posted</th>
                <th className="px-3 py-2 text-end">Terminal paid</th>
                <th className="px-3 py-2 text-end">Delivery</th>
                <th className="px-3 py-2 text-end">Attempts</th>
                <th className="px-3 py-2 text-end">Pipeline COD</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.geography.wilayas.slice(0, 30).map((wilaya) => (
                <tr key={`${wilaya.wilayaId}-${wilaya.name}`}>
                  <td className="px-3 py-2.5 font-medium">{wilaya.name}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, wilaya.postedOrders)}
                    {wilaya.untrackedOrders > 0 ? (
                      <span className="mt-0.5 block text-[10px] text-amber-700 dark:text-amber-400">
                        {formatNumber(locale, wilaya.untrackedOrders)} untracked
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, wilaya.terminalPaidRatePct)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatHours(locale, wilaya.deliveryMedianHours)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, wilaya.averageAttempts)}
                  </td>
                  <td className="px-3 py-2.5 text-end font-medium tabular-nums">
                    {formatMoney(locale, wilaya.pipelineCodDzd)}
                    {wilaya.pipelineCodDzd > 0 ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                        {formatPercent(locale, wilaya.providerAmountValueCoveragePct)} provider
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">Commune</th>
                <th className="px-3 py-2 text-start">Wilaya</th>
                <th className="px-3 py-2 text-end">Posted</th>
                <th className="px-3 py-2 text-end">Terminal paid</th>
                <th className="px-3 py-2 text-end">Delivery</th>
                <th className="px-3 py-2 text-end">Attempts</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.geography.communes
                .slice(0, 40)
                .map((commune: DataOf<'catalog'>['geography']['communes'][number]) => (
                  <tr key={`${commune.wilayaId}-${commune.name}`}>
                    <td className="max-w-52 truncate px-3 py-2.5 font-medium">{commune.name}</td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">
                      {commune.wilayaName}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, commune.postedOrders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, commune.terminalPaidRatePct)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatHours(locale, commune.deliveryMedianHours)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, commune.averageAttempts)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </DenseTable>
        </div>
      </Section>
      <div className="grid xl:grid-cols-[minmax(16rem,0.45fr)_minmax(0,1.55fr)]">
        <Section title={copy.sections.basketPairs}>
          <div className="divide-y divide-border/50 border-y border-border/60">
            {data.basketPairs.map((pair: { left: string; right: string; orders: number }) => (
              <div
                key={`${pair.left}-${pair.right}`}
                className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-sm"
              >
                <p className="min-w-0">
                  <span className="block truncate font-medium">{pair.left}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    + {pair.right}
                  </span>
                </p>
                <strong className="tabular-nums">{formatNumber(locale, pair.orders)}</strong>
              </div>
            ))}
          </div>
        </Section>
        <Section title={copy.sections.customerBase}>
          <div className="grid grid-cols-2 border-y border-border/60">
            {[
              ['Customers', formatNumber(locale, data.customers.summary.customers)],
              [
                'Second-order conversion',
                formatPercent(locale, data.customers.summary.secondOrderConversionPct),
              ],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-e border-border/45 px-3 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <DenseTable className="mt-5">
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">Customer</th>
                <th className="px-3 py-2 text-start">City</th>
                <th className="px-3 py-2 text-end">Submitted</th>
                <th className="px-3 py-2 text-end">Paid</th>
                <th className="px-3 py-2 text-end">Paid revenue</th>
                <th className="px-3 py-2 text-end">Contribution</th>
                <th className="px-3 py-2 text-end">Margin</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.customers.rows
                .slice()
                .sort(
                  (left: CatalogCustomer, right: CatalogCustomer) =>
                    right.orders - left.orders || right.totalValue - left.totalValue,
                )
                .slice(0, 50)
                .map((customer: CatalogCustomer, index: number) => (
                  <tr key={`${customer.name}-${customer.firstOrderAt}-${index}`}>
                    <td className="max-w-48 truncate px-3 py-2.5 font-medium">{customer.name}</td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">
                      {customer.city}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, customer.orders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, customer.paidOrders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatMoney(locale, customer.paidValueDzd)}
                    </td>
                    <td className="px-3 py-2.5 text-end font-medium tabular-nums">
                      {formatMoney(locale, customer.contributionLtvDzd)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, customer.paidContributionMarginPct)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <SidePanel
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={selected?.title ?? ''}
        description={[selected?.sku, selected?.brandName, selected?.categoryName]
          .filter(Boolean)
          .join(' · ')}
        closeLabel={copy.close}
      >
        {selected ? (
          <div className="divide-y divide-border/60">
            <div className="grid grid-cols-2 gap-4 p-5">
              {[
                [copy.columns.views, formatNumber(locale, selected.viewCount)],
                ['Posted orders', formatNumber(locale, selected.postedOrders)],
                ['Posted units', formatNumber(locale, selected.postedUnits)],
                ['Paid orders', formatNumber(locale, selected.paidOrders)],
                ['Returned orders', formatNumber(locale, selected.returnedOrders)],
                ['Still active', formatNumber(locale, selected.activeOrders)],
                ['Terminal paid rate', formatPercent(locale, selected.terminalPaidRatePct)],
                ['Cost coverage', formatPercent(locale, selected.costCoveragePct)],
                ['Projected contribution', formatMoney(locale, selected.projectedContributionDzd)],
                ['Median delivery', formatHours(locale, selected.deliveryMedianHours)],
                [copy.columns.conversion, formatPercent(locale, selected.websiteConversionRate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Exact Meta associations
              </p>
              {selected.metaAssociations.length ? (
                <div className="mt-3 divide-y divide-border/50 border-y border-border/60">
                  {selected.metaAssociations.map((association) => (
                    <div
                      key={association.adId}
                      className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {association.adName ?? association.adId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {association.campaignName ?? association.campaignId ?? 'Unknown campaign'}{' '}
                          · {association.adsetName ?? association.adsetId ?? 'Unknown ad set'}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-semibold tabular-nums">
                          {formatNumber(locale, association.attributedOrders)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(locale, association.paidOrders)} paid
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No exact ad-ID association in this range.
                </p>
              )}
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Period change
              </p>
              <div className="mt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Units</p>
                  <p className="mt-1 font-semibold">
                    {formatPercent(locale, selected.changes.unitsPct)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}

function nullableField(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function AssumptionsView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'assumptions'>;
  filters: Analytics2Payload['filters'];
  copy: Analytics2Copy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [settingsDraft, setSettingsDraft] = useState(() => ({
    fxRate: String(data.settings.fxRate),
    returnRate: String(data.settings.defaultReturnRate),
    restFrom: data.settings.restFrom ?? '',
  }));
  const { fxRate, returnRate, restFrom } = settingsDraft;
  const [showCostForm, setShowCostForm] = useState(false);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);
  const [costDraft, setCostDraft] = useState({
    name: '',
    amountDzd: '',
    period: 'monthly' as 'monthly' | 'once',
    startDate: filters.endDate,
    endDate: '',
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = data.days.find((day) => day.date === selectedDate) ?? null;
  const selectedDayHasManualOverride = Boolean(
    selectedDay &&
    (selectedDay.grossProfitSource === 'manual' ||
      selectedDay.returnRateSource === 'manual' ||
      selectedDay.confirmedOrdersSource === 'manual' ||
      selectedDay.note?.trim()),
  );
  const [dayDraft, setDayDraft] = useState({
    grossProfitDzd: '',
    returnRatePct: '',
    confirmedOrders: '',
    note: '',
  });

  function openDayOverride(selected: DataOf<'assumptions'>['days'][number]) {
    setSelectedDate(selected.date);
    setDayDraft({
      grossProfitDzd:
        selected.grossProfitSource === 'manual' && selected.grossProfitDzd != null
          ? String(selected.grossProfitDzd)
          : '',
      returnRatePct:
        selected.returnRateSource === 'manual' && selected.returnRatePct != null
          ? String(selected.returnRatePct)
          : '',
      confirmedOrders:
        selected.confirmedOrdersSource === 'manual' && selected.confirmedOrders != null
          ? String(selected.confirmedOrders)
          : '',
      note: selected.note ?? '',
    });
  }

  function openNewCost() {
    setEditingCostId(null);
    setCostDraft({
      name: '',
      amountDzd: '',
      period: 'monthly',
      startDate: filters.endDate,
      endDate: '',
    });
    setShowCostForm(true);
  }

  function openCost(cost: DataOf<'assumptions'>['costs'][number]) {
    if (!cost.id) return;
    setEditingCostId(cost.id);
    setCostDraft({
      name: cost.name,
      amountDzd: String(cost.amountDzd),
      period: cost.period,
      startDate: cost.startDate,
      endDate: cost.endDate ?? '',
    });
    setShowCostForm(true);
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['stats-workspace'] });
  }

  const settingsMutation = useMutation({
    mutationFn: (override?: number) =>
      request('/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: JSON.stringify({
          fxRate: Number(fxRate),
          defaultReturnRate: override ?? Number(returnRate),
          restFrom: restFrom || null,
        }),
      }),
    onSuccess: async () => {
      toast.success('Assumptions saved.');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const costMutation = useMutation({
    mutationFn: () =>
      request(
        editingCostId
          ? `/api/stats/profit-tracker/costs/${editingCostId}`
          : '/api/stats/profit-tracker/costs',
        {
          method: editingCostId ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: costDraft.name,
            amountDzd: Number(costDraft.amountDzd),
            period: costDraft.period,
            startDate: costDraft.startDate,
            endDate: costDraft.endDate || null,
          }),
        },
      ),
    onSuccess: async () => {
      toast.success(editingCostId ? 'Operating cost updated.' : 'Operating cost added.');
      setShowCostForm(false);
      setEditingCostId(null);
      setCostDraft({
        name: '',
        amountDzd: '',
        period: 'monthly',
        startDate: filters.endDate,
        endDate: '',
      });
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteCostMutation = useMutation({
    mutationFn: (id: number) =>
      request(`/api/stats/profit-tracker/costs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Operating cost removed.');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dayMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          grossProfitDzd: nullableField(dayDraft.grossProfitDzd),
          returnRatePct: nullableField(dayDraft.returnRatePct),
          confirmedOrders: nullableField(dayDraft.confirmedOrders),
          note: dayDraft.note.trim() || null,
        }),
      }),
    onSuccess: async () => {
      toast.success('Daily override saved.');
      setSelectedDate(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetDayMutation = useMutation({
    mutationFn: () =>
      request(`/api/stats/profit-tracker/days/${selectedDate}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Daily values returned to automatic sources.');
      setSelectedDate(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportParams = new URLSearchParams({ range: filters.range, endDate: filters.endDate });
  if (filters.startDate) exportParams.set('startDate', filters.startDate);
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section title={copy.sections.planningReturns}>
        <ReturnEvidence returns={data.returns} copy={copy} locale={locale} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={data.returns.mature.ratePct == null || settingsMutation.isPending}
            onClick={() => {
              const value = data.returns.mature.ratePct;
              if (value != null) {
                setSettingsDraft((current) => ({ ...current, returnRate: String(value) }));
                settingsMutation.mutate(value);
              }
            }}
          >
            {copy.returnCopy.useMature}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={data.returns.allTerminal.ratePct == null || settingsMutation.isPending}
            onClick={() => {
              const value = data.returns.allTerminal.ratePct;
              if (value != null) {
                setSettingsDraft((current) => ({ ...current, returnRate: String(value) }));
                settingsMutation.mutate(value);
              }
            }}
          >
            {copy.returnCopy.useTerminal}
          </Button>
        </div>
      </Section>
      <div className="grid xl:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.25fr)]">
        <Section title="Economic controls">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.fx}
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={fxRate}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, fxRate: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.defaultReturn}
              </span>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={returnRate}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, returnRate: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.restFrom}
              </span>
              <Input
                type="date"
                value={restFrom}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, restFrom: event.target.value }))
                }
              />
            </label>
            <Button
              disabled={settingsMutation.isPending || !Number(fxRate)}
              onClick={() => settingsMutation.mutate(undefined)}
            >
              {settingsMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Settings2 className="size-4" />
              )}
              {copy.save}
            </Button>
          </div>
        </Section>
        <Section
          title={copy.sections.operatingCosts}
          action={
            <Button size="sm" variant="outline" onClick={openNewCost}>
              <Plus className="size-3.5" />
              {copy.assumptions.newCost}
            </Button>
          }
        >
          {showCostForm ? (
            <div className="mb-5 grid gap-3 border-y border-border/60 bg-muted/10 py-4 sm:grid-cols-2 lg:grid-cols-3">
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.columns.name}
                </span>
                <Input
                  value={costDraft.name}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.amount}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={costDraft.amountDzd}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, amountDzd: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">Period</span>
                <NativeSelect
                  value={costDraft.period}
                  onChange={(event) =>
                    setCostDraft((current) => ({
                      ...current,
                      period: event.target.value as 'monthly' | 'once',
                    }))
                  }
                >
                  <NativeSelectOption value="monthly">
                    {copy.assumptions.monthly}
                  </NativeSelectOption>
                  <NativeSelectOption value="once">{copy.assumptions.once}</NativeSelectOption>
                </NativeSelect>
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.start}
                </span>
                <Input
                  type="date"
                  value={costDraft.startDate}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.end}
                </span>
                <Input
                  type="date"
                  value={costDraft.endDate}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
              <div className="flex items-end gap-2">
                <Button
                  disabled={
                    costMutation.isPending || !costDraft.name.trim() || !Number(costDraft.amountDzd)
                  }
                  onClick={() => costMutation.mutate()}
                >
                  {copy.save}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCostForm(false);
                    setEditingCostId(null);
                  }}
                >
                  {copy.cancel}
                </Button>
              </div>
            </div>
          ) : null}
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.name}</th>
                <th className="px-3 py-2 text-start">Period</th>
                <th className="px-3 py-2 text-end">{copy.assumptions.amount}</th>
                <th className="px-3 py-2 text-start">{copy.columns.date}</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.costs.map((cost) => (
                <tr
                  key={cost.id ?? `${cost.name}-${cost.startDate}`}
                  className={cost.id ? 'cursor-pointer hover:bg-muted/25' : undefined}
                  onClick={() => openCost(cost)}
                >
                  <td className="px-3 py-2.5 font-medium">{cost.name}</td>
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">{cost.period}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, cost.amountDzd)}
                  </td>
                  <td className="px-3 py-2.5">
                    {formatDate(locale, cost.startDate, false)}
                    {cost.endDate ? ` – ${formatDate(locale, cost.endDate, false)}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    {cost.id ? (
                      <button
                        type="button"
                        aria-label={`${copy.delete} ${cost.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`${copy.delete} ${cost.name}?`))
                            deleteCostMutation.mutate(cost.id!);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <Section
        title={copy.sections.dailyOverrides}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.open(
                `/api/stats/profit-tracker/export.csv?${exportParams.toString()}`,
                '_self',
              );
            }}
          >
            <Download className="size-3.5" />
            {copy.export}
          </Button>
        }
      >
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.date}</th>
              <th className="px-3 py-2 text-end">{copy.columns.grossProfit}</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-end">Return %</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-end">{copy.columns.confirmed}</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-start">{copy.columns.note}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.days.slice(0, 120).map((day) => (
              <tr
                key={day.date}
                className="cursor-pointer hover:bg-muted/25"
                onClick={() => openDayOverride(day)}
              >
                <td className="px-3 py-2.5 font-medium">{formatDate(locale, day.date, false)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, day.grossProfitDzd)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {day.grossProfitSource}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, day.returnRatePct)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {day.returnRateSource}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, day.confirmedOrders)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {day.confirmedOrdersSource}
                </td>
                <td className="max-w-56 truncate px-3 py-2.5 text-muted-foreground">
                  {day.note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>
      <Section title={copy.sections.formula}>
        <div className="divide-y divide-border/50 border-y border-border/60 font-mono text-xs">
          {Object.entries(data.formula).map(([key, value]) => (
            <div key={key} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <span className="font-sans font-medium text-foreground">{key}</span>
              <code className="overflow-x-auto text-muted-foreground">{value}</code>
            </div>
          ))}
        </div>
      </Section>
      <SidePanel
        open={Boolean(selectedDay)}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
        title={`${copy.assumptions.newOverride} · ${formatDate(locale, selectedDate, false)}`}
        description="Blank fields defer independently to the automatic source."
        closeLabel={copy.close}
        footer={
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              disabled={!selectedDayHasManualOverride || resetDayMutation.isPending}
              onClick={() => resetDayMutation.mutate()}
            >
              {copy.reset}
            </Button>
            <Button disabled={dayMutation.isPending} onClick={() => dayMutation.mutate()}>
              {copy.save}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.gross}
            </span>
            <Input
              type="number"
              value={dayDraft.grossProfitDzd}
              placeholder={
                selectedDay?.grossProfitDzd == null ? '' : String(selectedDay.grossProfitDzd)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, grossProfitDzd: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.returnRate}
            </span>
            <Input
              type="number"
              min="0"
              max="100"
              value={dayDraft.returnRatePct}
              placeholder={
                selectedDay?.returnRatePct == null ? '' : String(selectedDay.returnRatePct)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, returnRatePct: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.confirmed}
            </span>
            <Input
              type="number"
              min="0"
              step="1"
              value={dayDraft.confirmedOrders}
              placeholder={
                selectedDay?.confirmedOrders == null ? '' : String(selectedDay.confirmedOrders)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, confirmedOrders: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.notes}
            </span>
            <textarea
              className="min-h-28 w-full rounded-xl border border-input/20 bg-input px-3 py-2 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              value={dayDraft.note}
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>
        </div>
      </SidePanel>
    </>
  );
}

export function StatsWorkspace({ initialData }: { initialData: Analytics2Payload }) {
  const locale = useLocale();
  const t = useTranslations();
  const copy = getAnalytics2Copy(locale);
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(() => ({
    view: initialData.filters.view,
    range: initialData.filters.range,
    startDate: initialData.filters.startDate,
    endDate: initialData.filters.endDate,
    grain: initialData.filters.grain,
  }));
  const [rangeChoice, setRangeChoice] = useState<Analytics2Range>(initialData.filters.range);
  const [customStart, setCustomStart] = useState(
    initialData.filters.startDate ?? initialData.filters.endDate,
  );
  const [customEnd, setCustomEnd] = useState(initialData.filters.endDate);

  const routeSearchParams = useMemo(() => {
    const params = new URLSearchParams({
      range: filters.range,
      grain: filters.grain,
    });
    if (filters.range === 'custom' && filters.startDate) params.set('startDate', filters.startDate);
    if (filters.range === 'custom' && filters.endDate) params.set('endDate', filters.endDate);
    return params;
  }, [filters]);
  const apiSearchParams = useMemo(() => {
    const params = new URLSearchParams(routeSearchParams);
    params.set('view', filters.view);
    return params;
  }, [filters.view, routeSearchParams]);
  const matchesInitialQuery =
    filters.view === initialData.filters.view &&
    filters.range === initialData.filters.range &&
    filters.grain === initialData.filters.grain &&
    (filters.range !== 'custom' ||
      (filters.startDate === initialData.filters.startDate &&
        filters.endDate === initialData.filters.endDate));

  useEffect(() => {
    router.replace(`${pathname}?${routeSearchParams.toString()}`, { scroll: false });
  }, [pathname, routeSearchParams, router]);

  const analyticsQuery = useQuery({
    queryKey: [
      'stats-workspace',
      filters.view,
      filters.range,
      filters.range === 'custom' ? filters.startDate : null,
      filters.range === 'custom' ? filters.endDate : null,
      filters.grain,
    ],
    queryFn: ({ signal }) =>
      request<{ data: Analytics2Payload }>(`/api/stats/workspace?${apiSearchParams.toString()}`, {
        signal,
      }).then((response) => response.data),
    initialData: matchesInitialQuery ? initialData : undefined,
    initialDataUpdatedAt: matchesInitialQuery ? Date.parse(initialData.generatedAt) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const payload = analyticsQuery.data ?? initialData;
  const titleKey = {
    command: 'nav.statsOverview',
    money: 'nav.statsMoney',
    acquisition: 'nav.statsAcquisition',
    fulfillment: 'nav.statsFulfillment',
    storefront: 'nav.statsStorefront',
    search: 'nav.statsSearch',
    catalog: 'nav.statsCatalog',
    assumptions: 'nav.statsAssumptions',
  }[payload.filters.view] as Parameters<typeof t>[0];
  const updatedAt = `${copy.updated} ${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(payload.generatedAt))}`;
  useAdminAiSurfaceDetails(
    analyticsAiSurfaceDetails({
      view: payload.filters.view,
      range: payload.filters.range,
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      grain: payload.filters.grain,
      referenceDate: payload.referenceDate,
      reviewClock: payload.reviewClock,
      queryDurationMs: payload.diagnostics.queryDurationMs,
      responseSizeBytes: payload.diagnostics.responseSizeBytes,
      sources: payload.sources,
      effectiveRanges: payload.effectiveRanges,
      warnings: payload.warnings,
      fetching: analyticsQuery.isFetching,
    }),
  );

  function selectRange(range: Analytics2Range) {
    setRangeChoice(range);
    if (range === 'custom') return;
    setFilters((current) => ({ ...current, range, startDate: null }));
  }

  function renderView() {
    const data = payload.data;
    switch (data.kind) {
      case 'command':
        return (
          <CommandView
            data={data}
            copy={copy}
            locale={locale}
            onNavigate={(view) =>
              router.push(`/${locale}${statsPath(view)}?${routeSearchParams.toString()}`)
            }
          />
        );
      case 'money':
        return <MoneyView data={data} copy={copy} locale={locale} />;
      case 'acquisition':
        return (
          <AcquisitionView data={data} filters={payload.filters} copy={copy} locale={locale} />
        );
      case 'fulfillment':
        return <FulfillmentView data={data} copy={copy} locale={locale} />;
      case 'storefront':
        return <StorefrontView data={data} filters={payload.filters} copy={copy} locale={locale} />;
      case 'search':
        return (
          <SearchVisibilityView
            data={data}
            filters={payload.filters}
            reviewClock={payload.reviewClock}
            copy={copy}
            locale={locale}
          />
        );
      case 'catalog':
        return <CatalogView data={data} copy={copy} locale={locale} />;
      case 'assumptions':
        return (
          <AssumptionsView data={data} filters={payload.filters} copy={copy} locale={locale} />
        );
    }
  }

  return (
    <WorkspaceFrame className="overflow-x-hidden" data-admin-workspace="stats">
      <WorkspaceHeader>
        <WorkspaceHeading title={t(titleKey)} description={updatedAt} />
        <WorkspaceActions>
          <Button
            size="sm"
            variant="outline"
            disabled={analyticsQuery.isFetching}
            onClick={() => analyticsQuery.refetch()}
          >
            {analyticsQuery.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="sr-only sm:not-sr-only">{copy.refresh}</span>
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden flex-wrap gap-1 lg:flex">
            {rangeKeys.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => selectRange(range)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  rangeChoice === range
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {copy.ranges[range]}
              </button>
            ))}
          </div>
          <NativeSelect
            aria-label="Analytics range"
            name="analytics-range"
            className="w-auto lg:hidden"
            value={rangeChoice}
            onChange={(event) => selectRange(event.target.value as Analytics2Range)}
          >
            {rangeKeys.map((range) => (
              <NativeSelectOption key={range} value={range}>
                {copy.ranges[range]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {rangeChoice === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Start date"
                name="analytics-start-date"
                className="w-auto"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                aria-label="End date"
                name="analytics-end-date"
                className="w-auto"
                type="date"
                value={customEnd}
                min={customStart}
                max={payload.referenceDate}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
              <Button
                size="sm"
                disabled={!customStart || !customEnd || customStart > customEnd}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    range: 'custom',
                    startDate: customStart,
                    endDate: customEnd,
                  }))
                }
              >
                {copy.apply}
              </Button>
            </div>
          ) : null}
          <NativeSelect
            aria-label="Analytics grain"
            name="analytics-grain"
            className="ms-auto w-auto"
            value={filters.grain}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                grain: event.target.value as typeof filters.grain,
              }))
            }
          >
            {grainKeys.map((grain) => (
              <NativeSelectOption key={grain} value={grain}>
                {copy.grains[grain]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </WorkspaceToolbar>
      <SourceRail payload={payload} copy={copy} locale={locale} />
      <WarningRail payload={payload} copy={copy} locale={locale} />
      {analyticsQuery.isFetching ? (
        <div className="h-0.5 overflow-hidden bg-primary/10">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {analyticsQuery.error ? (
        <div className="border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-6">
          {analyticsQuery.error instanceof Error
            ? analyticsQuery.error.message
            : 'Analytics request failed.'}
        </div>
      ) : null}
      <main
        aria-busy={analyticsQuery.isFetching}
        className={cn(
          'min-w-0 transition-opacity',
          analyticsQuery.isPlaceholderData && 'opacity-65',
        )}
      >
        {renderView()}
      </main>
    </WorkspaceFrame>
  );
}
