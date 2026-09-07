'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requestJson as request } from '../../../lib/admin-api';
import type { AiStatsPayload, AiStatsRange } from '../../../lib/ai-stats';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { getAiStatsCopy } from '../ai-stats-copy';
import { ANALYTICS_TIME_ZONE } from '../analytics-format';
import { AnalyticsRangeControls } from '../analytics-range-controls';
import { OperationsView } from './operations';
import { ShoppingView } from './shopping';

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
