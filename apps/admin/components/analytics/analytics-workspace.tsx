'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AnalyticsPayload, AnalyticsRange } from '../../lib/analytics';
import { statsPath } from '../../lib/analytics-routes';
import { requestJson as request } from '../../lib/admin-api';
import { analyticsAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { cn } from '../../lib/utils';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Button } from '../ui/button';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { AnalyticsRangeControls } from './analytics-range-controls';
import { AcquisitionView } from './analytics-acquisition-view';
import { AssumptionsView } from './analytics-assumptions-view';
import { CatalogView } from './analytics-catalog-view';
import { CommandView, MoneyView } from './analytics-command-money-views';
import { getAnalyticsCopy } from './analytics-copy';
import { FulfillmentView } from './analytics-fulfillment-view';
import { ANALYTICS_TIME_ZONE } from './analytics-format';
import { SearchVisibilityView } from './analytics-search-view';
import { StorefrontView } from './analytics-storefront-view';
import {
  AnalyticsAssistantFocusProvider,
  SourceRail,
  WarningRail,
} from './analytics-workspace-primitives';

export { completedTrendBuckets, splitPartialSeries } from './analytics-workspace-primitives';

export function StatsWorkspace({ initialData }: { initialData: AnalyticsPayload }) {
  const locale = useLocale();
  const t = useTranslations();
  const copy = getAnalyticsCopy(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initialDataReceivedAt] = useState(() => Date.now());
  const forceRefresh = useRef(false);
  const [filters, setFilters] = useState(() => ({
    view: initialData.filters.view,
    range: initialData.filters.range,
    startDate: initialData.filters.startDate,
    endDate: initialData.filters.endDate,
    grain: initialData.filters.grain,
  }));
  const [rangeChoice, setRangeChoice] = useState<AnalyticsRange>(initialData.filters.range);
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
    const currentQuery = searchParams.toString();
    const usesDefaultFilters = filters.range === '30d' && filters.grain === 'auto';
    // Keep the clean route canonical for the default view. Replacing it with
    // explicit defaults on hydration starts an otherwise identical RSC render
    // and repeats the most expensive analytics query.
    if (!currentQuery && usesDefaultFilters) return;
    const normalizedQuery = routeSearchParams.toString();
    if (currentQuery === normalizedQuery) return;
    // React Query owns filter loading. A router navigation would also rerun
    // the server page and calculate the same report a second time.
    window.history.replaceState(null, '', `${pathname}?${normalizedQuery}`);
  }, [filters.grain, filters.range, pathname, routeSearchParams, searchParams]);

  const analyticsQuery = useQuery({
    queryKey: [
      'stats-workspace',
      filters.view,
      filters.range,
      filters.range === 'custom' ? filters.startDate : null,
      filters.range === 'custom' ? filters.endDate : null,
      filters.grain,
    ],
    queryFn: ({ signal }) => {
      const refresh = forceRefresh.current;
      forceRefresh.current = false;
      return request<{ data: AnalyticsPayload }>(
        `/api/stats/workspace?${apiSearchParams.toString()}${refresh ? '&refresh=1' : ''}`,
        {
          signal,
        },
      ).then((response) => response.data);
    },
    initialData: matchesInitialQuery ? initialData : undefined,
    initialDataUpdatedAt: matchesInitialQuery
      ? initialData.diagnostics.cache?.state === 'stale'
        ? 0
        : initialDataReceivedAt
      : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.diagnostics.cache?.state === 'stale' ? 5_000 : false,
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
    timeZone: ANALYTICS_TIME_ZONE,
  }).format(new Date(payload.diagnostics.cache?.computedAt ?? payload.generatedAt))}`;
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

  function selectRange(range: AnalyticsRange) {
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
            onClick={() => {
              forceRefresh.current = true;
              void analyticsQuery.refetch();
            }}
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
            range: copy.labels.analyticsRange,
            grain: copy.labels.analyticsGrain,
            startDate: copy.labels.startDate,
            endDate: copy.labels.endDate,
          }}
          namePrefix="analytics"
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
            : copy.labels.analyticsRequestFailed}
        </div>
      ) : null}
      <main
        aria-busy={analyticsQuery.isFetching}
        className={cn(
          'min-w-0 transition-opacity',
          analyticsQuery.isPlaceholderData && 'opacity-65',
        )}
      >
        <AnalyticsAssistantFocusProvider key={payload.filters.view} view={payload.filters.view}>
          {renderView()}
        </AnalyticsAssistantFocusProvider>
      </main>
    </WorkspaceFrame>
  );
}
