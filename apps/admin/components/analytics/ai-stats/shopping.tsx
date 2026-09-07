'use client';
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { AiShoppingStats, AiStatsPayload } from '../../../lib/ai-stats';
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
  humanizeAnalyticsKey,
} from '../analytics-presentation';
import { completedTrendBuckets } from '../analytics-workspace-primitives';
import { MetricStrip, entityLabel } from './metrics';

export function ShoppingView({
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
