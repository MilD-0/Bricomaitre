'use client';
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { AiOperationsStats, AiStatsPayload } from '../../../lib/ai-stats';
import { cn } from '../../../lib/utils';
import { type AiStatsCopy } from '../ai-stats-copy';
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUsd,
} from '../analytics-format';
import {
  AnalyticsDenseTable,
  AnalyticsEmptyState,
  AnalyticsTableHead,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsSection as Section,
} from '../analytics-presentation';
import { completedTrendBuckets } from '../analytics-workspace-primitives';
import { MetricStrip, entityLabel } from './metrics';

export function OperationsView({
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
