'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';

import type {
  AiOperationsStats,
  AiShoppingStats,
  AiStatsMetric,
  AiStatsPayload,
  AiStatsRange,
} from '../../lib/ai-stats';
import { requestJson as request } from '../../lib/admin-api';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { AnalyticsRangeControls } from './analytics-range-controls';
import {
  ANALYTICS_TIME_ZONE,
  formatDate,
  formatDuration,
  formatDzd,
  formatNumber,
  formatPercent,
  formatUsd,
} from './analytics-format';
import { getAiStatsCopy, type AiStatsCopy } from './ai-stats-copy';
import {
  AnalyticsDenseTable,
  AnalyticsEmptyState,
  AnalyticsMetricCell,
  AnalyticsMetricStrip,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsSection as Section,
  AnalyticsTableHead,
  humanizeAnalyticsKey,
} from './analytics-presentation';
import { completedTrendBuckets } from './analytics-workspace-primitives';

function formatMetric(locale: string, metric: AiStatsMetric) {
  if (metric.unit === 'percent') return formatPercent(locale, metric.value);
  if (metric.unit === 'milliseconds') return formatDuration(locale, metric.value);
  if (metric.unit === 'usd') return formatUsd(locale, metric.value);
  if (metric.unit === 'dzd') return formatDzd(locale, metric.value, true);
  return formatNumber(locale, metric.value, true);
}

function entityLabel(labels: Record<string, string>, key: string) {
  return labels[key] ?? humanizeAnalyticsKey(key);
}

function MetricStrip({
  metrics,
  copy,
  locale,
}: {
  metrics: AiStatsMetric[];
  copy: AiStatsCopy;
  locale: string;
}) {
  return (
    <AnalyticsMetricStrip>
      {metrics.map((metric) => (
        <AnalyticsMetricCell
          key={metric.key}
          label={
            copy.metrics[metric.key as keyof typeof copy.metrics] ??
            humanizeAnalyticsKey(metric.key)
          }
          value={
            <strong className="block truncate text-xl font-semibold tracking-[var(--type-tracking-n035)] tabular-nums sm:text-2xl">
              {formatMetric(locale, metric)}
            </strong>
          }
          detail={metric.sample != null ? `n=${formatNumber(locale, metric.sample)}` : null}
        />
      ))}
    </AnalyticsMetricStrip>
  );
}

function OperationsView({
  data,
  filters,
  copy,
  locale,
}: {
  data: AiOperationsStats;
  filters: AiStatsPayload['filters'];
  copy: AiStatsCopy;
  locale: string;
}) {
  const trend = completedTrendBuckets(data.trend, filters.resolvedGrain, filters.endDate);
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section title={copy.sections.outcomeTrend}>
        {data.trend.length ? (
          <div className="h-[18rem] w-full">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
                <XAxis
                  dataKey="bucket"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip
                  labelFormatter={(value) => formatDate(locale, String(value))}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--shape-radius-lg)',
                  }}
                />
                <Bar
                  dataKey="completed"
                  name={copy.chart.completed}
                  stackId="outcome"
                  fill="var(--chart-teal)"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  name={copy.chart.failed}
                  stackId="outcome"
                  fill="var(--chart-rose)"
                />
                <Bar
                  dataKey="cancelled"
                  name={copy.chart.cancelled}
                  stackId="outcome"
                  fill="var(--chart-amber)"
                />
              </ComposedChart>
            </ResponsiveChart>
          </div>
        ) : (
          <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
        )}
      </Section>
      <Section title={copy.sections.workflows} className="overflow-hidden">
        {data.workflows.length ? (
          <AnalyticsDenseTable label={copy.sections.workflows}>
            <AnalyticsTableHead>
              <tr className="border-b border-border/70 text-start text-[length:var(--type-size-label-px)] uppercase tracking-[var(--type-tracking-p120)] text-muted-foreground">
                <th className="px-2 py-2 text-start font-medium">{copy.columns.workflow}</th>
                <th className="px-2 py-2 text-start font-medium">{copy.columns.mode}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.runs}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.completion}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.failures}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.latency}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.tokens}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.cost}</th>
              </tr>
            </AnalyticsTableHead>
            <tbody>
              {data.workflows.map((row) => (
                <tr key={row.task} className="border-b border-border/45 last:border-0">
                  <td className="px-2 py-3 font-medium">
                    {entityLabel(copy.entities.workflows, row.task)}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">{copy.workload[row.mode]}</td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, row.runs)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatPercent(locale, row.completionPct)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, row.failed)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatDuration(locale, row.p95DurationMs)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, row.tokens, true)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatUsd(locale, row.estimatedCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </AnalyticsDenseTable>
        ) : (
          <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
        )}
      </Section>
      <div className="grid min-w-0 lg:grid-cols-2">
        <Section title={copy.sections.tools} className="lg:border-e">
          {data.tools.length ? (
            <div className="divide-y divide-border/45">
              {data.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">
                    {entityLabel(copy.entities.tools, tool.name)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(locale, tool.calls)}
                  </span>
                  <span className="w-16 text-end tabular-nums">
                    {formatPercent(locale, tool.completionPct)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
          )}
        </Section>
        <Section title={copy.sections.changes}>
          {data.changes.length ? (
            <div className="divide-y divide-border/45">
              {data.changes.map((change) => (
                <div
                  key={`${change.type}:${change.status}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">
                    {entityLabel(copy.entities.changes, change.type)}
                  </span>
                  <span className="text-muted-foreground">
                    {entityLabel(copy.entities.statuses, change.status)}
                  </span>
                  <span className="w-12 text-end tabular-nums">
                    {formatNumber(locale, change.count)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
          )}
        </Section>
      </div>
      <Section title={copy.sections.releases} className="overflow-hidden">
        {data.releases.length ? (
          <AnalyticsDenseTable label={copy.sections.releases}>
            <AnalyticsTableHead>
              <tr className="border-b border-border/70 text-[length:var(--type-size-label-px)] uppercase tracking-[var(--type-tracking-p120)] text-muted-foreground">
                <th className="px-2 py-2 text-start font-medium">{copy.columns.prompt}</th>
                <th className="px-2 py-2 text-start font-medium">{copy.columns.model}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.runs}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.completion}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.latency}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.cost}</th>
              </tr>
            </AnalyticsTableHead>
            <tbody>
              {data.releases.map((release) => (
                <tr
                  key={`${release.promptVersion}:${release.model}`}
                  className="border-b border-border/45 last:border-0"
                >
                  <td className="px-2 py-3 font-medium">{release.promptVersion}</td>
                  <td className="max-w-[18rem] truncate px-2 py-3 text-muted-foreground">
                    {release.model}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, release.runs)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatPercent(locale, release.completionPct)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatDuration(locale, release.p95DurationMs)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatUsd(locale, release.estimatedCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </AnalyticsDenseTable>
        ) : (
          <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
        )}
      </Section>
      {data.exceptions.length ? (
        <Section title={copy.sections.exceptions}>
          <div className="divide-y divide-border/45">
            {data.exceptions.map((item) => (
              <div
                key={item.id}
                className="grid gap-1 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              >
                <span className="text-xs text-muted-foreground">
                  {formatDate(locale, item.startedAt, { includeTime: true })}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {entityLabel(copy.entities.workflows, item.task)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.promptVersion} · {item.model}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-medium',
                    item.status === 'failed'
                      ? 'text-destructive'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {entityLabel(copy.entities.statuses, item.errorCode ?? item.status)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function ShoppingView({
  data,
  filters,
  copy,
  locale,
}: {
  data: AiShoppingStats;
  filters: AiStatsPayload['filters'];
  copy: AiStatsCopy;
  locale: string;
}) {
  const trend = completedTrendBuckets(data.trend, filters.resolvedGrain, filters.endDate);
  const headlineMetrics = data.metrics.filter(
    (metric) => metric.key !== 'paidContributionCoverage',
  );
  const reliability = [
    {
      label: copy.reliability.activeJourneys,
      value: formatNumber(locale, data.summary.activeJourneys),
    },
    { label: copy.reliability.completedRuns, value: formatNumber(locale, data.summary.completed) },
    { label: copy.reliability.failedRuns, value: formatNumber(locale, data.summary.failed) },
    {
      label: copy.reliability.p95Latency,
      value: formatDuration(locale, data.summary.p95DurationMs),
    },
    {
      label: copy.reliability.contributionCoverage,
      value: formatPercent(locale, data.orders.contributionCoveragePct),
    },
    {
      label: copy.reliability.ratings,
      value: data.summary.ratedAnswers
        ? `${data.summary.helpfulAnswers}/${data.summary.ratedAnswers}`
        : copy.reliability.noRatings,
    },
    {
      label: copy.reliability.estimatedCost,
      value: formatUsd(locale, data.summary.estimatedCostUsd),
    },
  ];
  const journeyMax = Math.max(1, ...data.journey.map((step) => step.value));

  return (
    <>
      <MetricStrip metrics={headlineMetrics} copy={copy} locale={locale} />
      <div className="grid min-w-0 border-b border-border/60 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <Section title={copy.sections.journey} className="border-b-0 lg:border-e">
          <div className="divide-y divide-border/45">
            {data.journey.map((step) => (
              <div
                key={step.key}
                className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(8rem,1.2fr)_auto] items-center gap-3 py-3 text-sm"
              >
                <span className="font-medium">
                  {copy.journey[step.key as keyof typeof copy.journey] ??
                    humanizeAnalyticsKey(step.key)}
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${Math.max(0, (step.value / journeyMax) * 100)}%` }}
                  />
                </div>
                <span className="min-w-10 text-end font-medium tabular-nums">
                  {formatNumber(locale, step.value)}
                </span>
              </div>
            ))}
          </div>
        </Section>
        <Section title={copy.sections.reliability} className="border-b-0">
          <div className="grid grid-cols-2 gap-x-5 gap-y-5">
            {reliability.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{item.label}</p>
                <strong className="mt-1 block truncate text-base font-semibold">
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title={copy.sections.demandTrend}>
        {data.trend.length ? (
          <div className="h-[17rem] w-full">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
                <XAxis
                  dataKey="bucket"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip
                  labelFormatter={(value) => formatDate(locale, String(value))}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--shape-radius-lg)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  name={copy.chart.questions}
                  stroke="var(--chart-teal)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="resultClicks"
                  name={copy.chart.resultClicks}
                  stroke="var(--chart-violet)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </div>
        ) : (
          <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
        )}
      </Section>
      <Section title={copy.sections.intents} className="overflow-hidden">
        {data.intents.length ? (
          <AnalyticsDenseTable label={copy.sections.intents}>
            <AnalyticsTableHead>
              <tr className="border-b border-border/70 text-[length:var(--type-size-label-px)] uppercase tracking-[var(--type-tracking-p120)] text-muted-foreground">
                <th className="px-2 py-2 text-start font-medium">{copy.columns.intent}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.questions}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.runs}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.completion}</th>
                <th className="px-2 py-2 text-end font-medium">{copy.columns.clicks}</th>
              </tr>
            </AnalyticsTableHead>
            <tbody>
              {data.intents.map((intent) => (
                <tr key={intent.name} className="border-b border-border/45 last:border-0">
                  <td className="px-2 py-3 font-medium">
                    {entityLabel(copy.entities.intents, intent.name)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, intent.messages)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, intent.runs)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatPercent(locale, intent.completionPct)}
                  </td>
                  <td className="px-2 py-3 text-end tabular-nums">
                    {formatNumber(locale, intent.resultClicks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </AnalyticsDenseTable>
        ) : (
          <AnalyticsEmptyState>{copy.noData}</AnalyticsEmptyState>
        )}
      </Section>
    </>
  );
}

export function AiStatsWorkspace({ initialData }: { initialData: AiStatsPayload }) {
  const locale = useLocale();
  const copy = getAiStatsCopy(locale);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initialDataReceivedAt] = useState(() => Date.now());
  const [filters, setFilters] = useState(initialData.filters);
  const [rangeChoice, setRangeChoice] = useState<AiStatsRange>(initialData.filters.range);
  const [customStart, setCustomStart] = useState(initialData.filters.startDate ?? '');
  const [customEnd, setCustomEnd] = useState(initialData.filters.endDate);

  const routeSearchParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('range', filters.range);
    if (filters.range === 'custom' && filters.startDate) {
      params.set('startDate', filters.startDate);
      params.set('endDate', filters.endDate);
    }
    params.set('grain', filters.grain);
    return params;
  }, [filters]);
  const apiSearchParams = useMemo(() => {
    const params = new URLSearchParams(routeSearchParams);
    params.set('surface', initialData.surface);
    return params;
  }, [initialData.surface, routeSearchParams]);
  const matchesInitialQuery =
    filters.surface === initialData.filters.surface &&
    filters.range === initialData.filters.range &&
    filters.grain === initialData.filters.grain &&
    (filters.range !== 'custom' ||
      (filters.startDate === initialData.filters.startDate &&
        filters.endDate === initialData.filters.endDate));

  useEffect(() => {
    const currentQuery = searchParams.toString();
    const usesDefaultFilters = filters.range === '30d' && filters.grain === 'auto';
    if (!currentQuery && usesDefaultFilters) return;
    const normalized = routeSearchParams.toString();
    if (currentQuery === normalized) return;
    // React Query owns filter loading. A router navigation would also rerun
    // the server page, masking request failures and recalculating the report.
    window.history.replaceState(null, '', `${pathname}?${normalized}`);
  }, [filters.grain, filters.range, pathname, routeSearchParams, searchParams]);

  const query = useQuery({
    queryKey: [
      'ai-stats',
      initialData.surface,
      filters.range,
      filters.range === 'custom' ? filters.startDate : null,
      filters.range === 'custom' ? filters.endDate : null,
      filters.grain,
    ],
    queryFn: ({ signal }) =>
      request<{ data: AiStatsPayload }>(`/api/stats/ai?${apiSearchParams.toString()}`, {
        signal,
      }).then((response) => response.data),
    initialData: matchesInitialQuery ? initialData : undefined,
    initialDataUpdatedAt: matchesInitialQuery ? initialDataReceivedAt : undefined,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
  const payload = query.data ?? initialData;
  const title = payload.surface === 'operations' ? copy.operationsTitle : copy.shoppingTitle;
  const updatedAt = `${copy.updated} ${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: ANALYTICS_TIME_ZONE,
  }).format(new Date(payload.generatedAt))}`;

  function selectRange(range: AiStatsRange) {
    setRangeChoice(range);
    if (range === 'custom') return;
    setFilters((current) => ({ ...current, range, startDate: null }));
  }

  return (
    <WorkspaceFrame className="overflow-x-hidden" data-admin-workspace="ai-stats">
      <WorkspaceHeader>
        <WorkspaceHeading title={title} description={updatedAt} />
        <WorkspaceActions>
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            {query.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="sr-only sm:not-sr-only">{copy.refresh}</span>
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceToolbar>
        <AnalyticsRangeControls
          range={rangeChoice}
          grain={filters.grain}
          customStart={customStart}
          customEnd={customEnd}
          maxEndDate={payload.referenceDate}
          rangeLabels={copy.ranges}
          grainLabels={copy.grains}
          applyLabel={copy.apply}
          ariaLabels={{
            range: 'AI analytics range',
            grain: 'AI analytics grain',
            startDate: 'Start date',
            endDate: 'End date',
          }}
          namePrefix="ai-analytics"
          onRangeChange={selectRange}
          onGrainChange={(grain) => setFilters((current) => ({ ...current, grain }))}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          onApplyCustom={() =>
            setFilters((current) => ({
              ...current,
              range: 'custom',
              startDate: customStart,
              endDate: customEnd,
            }))
          }
        />
      </WorkspaceToolbar>
      {query.isFetching ? (
        <div className="h-0.5 overflow-hidden bg-primary/10">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {query.error ? (
        <div className="border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-6">
          {query.error instanceof Error ? query.error.message : copy.requestFailed}
        </div>
      ) : null}
      <main
        aria-busy={query.isFetching}
        className={cn('min-w-0 transition-opacity', query.isPlaceholderData && 'opacity-65')}
      >
        {payload.data.kind === 'operations' ? (
          <OperationsView
            data={payload.data}
            filters={payload.filters}
            copy={copy}
            locale={locale}
          />
        ) : (
          <ShoppingView data={payload.data} filters={payload.filters} copy={copy} locale={locale} />
        )}
      </main>
    </WorkspaceFrame>
  );
}
