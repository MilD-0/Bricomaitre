'use client';
import { AlertTriangle } from 'lucide-react';
import type { AnalyticsPayload } from '../../../lib/analytics';
import { cn } from '../../../lib/utils';
import { type AnalyticsCopy } from '../analytics-copy';
import { formatDzd as formatMoney, formatNumber, formatPercent } from '../analytics-format';

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
        <span className="text-[length:var(--type-size-label-px)] font-semibold uppercase tracking-[var(--type-tracking-p100)] text-muted-foreground">
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
