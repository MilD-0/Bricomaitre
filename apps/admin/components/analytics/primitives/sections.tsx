'use client';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useContext } from 'react';
import { analyticsFocusAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import type { AnalyticsMetric } from '../../../lib/analytics';
import { cn } from '../../../lib/utils';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import { getAnalyticsCopy, type AnalyticsCopy } from '../analytics-copy';
import { formatPercent } from '../analytics-format';
import {
  AnalyticsDenseTable,
  AnalyticsMetricCell,
  AnalyticsMetricStrip,
  AnalyticsSection,
} from '../analytics-presentation';
import { AnalyticsAssistantFocusContext, type AnalyticsAssistantFocus } from './focus';
import { formatMetric } from './format';

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
                <strong className="max-w-full whitespace-nowrap text-lg font-semibold tracking-[var(--type-tracking-n035)] tabular-nums sm:text-2xl">
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
