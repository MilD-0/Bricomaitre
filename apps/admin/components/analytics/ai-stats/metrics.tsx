'use client';
import type { AiStatsMetric } from '../../../lib/ai-stats';
import { type AiStatsCopy } from '../ai-stats-copy';
import {
  formatDuration,
  formatDzd,
  formatNumber,
  formatPercent,
  formatUsd,
} from '../analytics-format';
import {
  AnalyticsMetricCell,
  AnalyticsMetricStrip,
  humanizeAnalyticsKey,
} from '../analytics-presentation';

function formatMetric(locale: string, metric: AiStatsMetric) {
  if (metric.unit === 'percent') return formatPercent(locale, metric.value);
  if (metric.unit === 'milliseconds') return formatDuration(locale, metric.value);
  if (metric.unit === 'usd') return formatUsd(locale, metric.value);
  if (metric.unit === 'dzd') return formatDzd(locale, metric.value, true);
  return formatNumber(locale, metric.value, true);
}

export function entityLabel(labels: Record<string, string>, key: string) {
  return labels[key] ?? humanizeAnalyticsKey(key);
}

export function MetricStrip({
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
