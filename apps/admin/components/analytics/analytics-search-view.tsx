'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';

import type { AnalyticsPayload } from '../../lib/analytics';
import { requestJson as request } from '../../lib/admin-api';
import { analyticsFocusAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Button } from '../ui/button';
import { SidePanel } from '../ui/side-panel';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from './analytics-presentation';
import { formatDate, formatNumber, formatPercent } from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import {
  AnalyticsAssistantFocusContext,
  chartTooltip,
  type DataOf,
  DenseTable,
  MetricStrip,
  Section,
} from './analytics-workspace-primitives';

type SearchOpportunity = DataOf<'search'>['opportunities'][number];
type SearchPage = DataOf<'search'>['pages'][number];

export function SearchVisibilityView({
  data,
  filters,
  reviewClock,
  copy,
  locale,
}: {
  data: DataOf<'search'>;
  filters: AnalyticsPayload['filters'];
  reviewClock: boolean;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [selectedQuery, setSelectedQuery] = useState<SearchOpportunity | null>(null);
  const [selectedPage, setSelectedPage] = useState<SearchPage | null>(null);
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    if (selectedQuery) {
      setActiveAssistantFocus?.({
        dimension: 'search_opportunities',
        search: selectedQuery.query,
      });
    } else if (selectedPage) {
      setActiveAssistantFocus?.({ dimension: 'search_pages', search: selectedPage.path });
    }
  }, [selectedPage, selectedQuery, setActiveAssistantFocus]);
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: selectedQuery ? 'search_opportunities' : selectedPage ? 'search_pages' : null,
      search: selectedQuery?.query ?? selectedPage?.path ?? null,
    }),
  );
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
      toast.success(copy.labels.googleSearchSynchronized);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : copy.labels.syncFailed),
  });
  const inspectionIssues = data.indexHealth.issues;
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.searchTrend}
        analyticsFocus={{ dimension: 'search_trend' }}
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
            {sync.isPending ? copy.syncing : copy.labels.syncGoogle}
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
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="impressions"
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="clicks"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar
                  yAxisId="impressions"
                  dataKey="impressions"
                  name={copy.metrics.searchImpressions}
                  fill="var(--chart-violet)"
                  opacity={0.28}
                />
                <Line
                  yAxisId="clicks"
                  type="monotone"
                  dataKey="clicks"
                  name={copy.metrics.searchClicks}
                  stroke="var(--chart-teal)"
                  strokeWidth={2.25}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </div>
      </Section>

      <Section
        title={copy.sections.searchOpportunities}
        analyticsFocus={{
          dimension: 'search_opportunities',
          search: selectedQuery?.query ?? null,
        }}
      >
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
                    <span>
                      {formatNumber(locale, row.impressions)} {copy.labels.impressions}
                    </span>
                    <span>
                      {copy.labels.position} {formatNumber(locale, row.position)}
                    </span>
                    <span className="font-medium text-foreground">
                      +{formatNumber(locale, row.potentialClicks)} {copy.labels.clicks}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <DenseTable className="hidden md:block">
              <TableHead>
                <tr>
                  <th className="px-3 py-2 text-start">{copy.columns.query}</th>
                  <th className="px-3 py-2 text-start">{copy.labels.opportunity}</th>
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
                        {formatNumber(locale, row.pages)} {copy.labels.rankingPages} ·{' '}
                        {row.branded ? copy.labels.brand : copy.labels.discovery}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.opportunity === 'strikingDistance'
                        ? copy.labels.nearPageOne
                        : row.opportunity === 'ctrGap'
                          ? copy.labels.ctrGap
                          : copy.labels.contentGap}
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
        analyticsFocus={{
          dimension: 'search_pages',
          search: selectedPage?.path ?? null,
        }}
        description={copy.labels.searchLandingPagesDescription}
      >
        <div className="divide-y divide-border/50 border-y border-border/60 md:hidden">
          {data.pages.slice(0, 40).map((row: SearchPage) => (
            <button
              key={row.page}
              type="button"
              className="block w-full py-3 text-start"
              onClick={() => setSelectedPage(row)}
            >
              <span className="block truncate text-sm font-medium">{row.label}</span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {formatNumber(locale, row.clicks)} {copy.labels.clicks}
                </span>
                <span>
                  {formatNumber(locale, row.impressions)} {copy.labels.impressions}
                </span>
                <span>
                  {copy.labels.position} {formatNumber(locale, row.position)}
                </span>
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
              <th className="px-3 py-2 text-end">{copy.labels.queries}</th>
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
                  <p className="truncate font-medium">{row.label}</p>
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
              [copy.labels.devices, data.devices, 'device'],
              [copy.labels.countries, data.countries.slice(0, 8), 'country'],
            ].map(([title, rows, field]) => (
              <div key={String(title)}>
                <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
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
              <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
                {copy.labels.searchAppearance}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 border-y border-border/60 py-3 text-sm">
                {data.appearances.map((row) => (
                  <span key={row.appearance}>
                    <strong>{row.appearance.replaceAll('_', ' ')}</strong>{' '}
                    <span className="text-muted-foreground">
                      {formatNumber(locale, row.clicks)} {copy.labels.clicks} ·{' '}
                      {formatNumber(locale, row.impressions)} {copy.labels.impressions}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
        <Section
          title={copy.sections.indexHealth}
          analyticsFocus={{ dimension: 'search_index_issues' }}
        >
          <div className="divide-y divide-border/50 border-y border-border/60">
            {data.indexHealth.sitemaps.map((sitemap) => (
              <div key={sitemap.path} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{copy.labels.sitemap}</span>
                  <strong className="tabular-nums">
                    {formatNumber(locale, sitemap.submittedUrls)} {copy.labels.urls}
                  </strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(locale, sitemap.errors)} {copy.labels.errors.toLowerCase()} ·{' '}
                  {formatNumber(locale, sitemap.warnings)} {copy.labels.warnings} ·{' '}
                  {copy.labels.downloaded}{' '}
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
                <span className="font-medium">{copy.labels.inspectedSample}</span>
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
                {!data.indexHealth.inspections.length
                  ? copy.labels.noUrlsInspected
                  : inspectionIssues.length
                    ? `${formatNumber(locale, inspectionIssues.length)} ${copy.labels.pagesNeedReview}`
                    : copy.labels.noActionableIssue}
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
        description={copy.labels.searchOpportunityEvidence}
        closeLabel={copy.close}
      >
        {selectedQuery ? (
          <div className="space-y-6 px-5 py-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{copy.labels.currentCtr}</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatPercent(locale, selectedQuery.ctrPct)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{copy.labels.comparableCtr}</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatPercent(locale, selectedQuery.benchmarkCtrPct)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
                {copy.labels.rankingPages}
              </p>
              <div className="mt-2 divide-y divide-border/50 border-y border-border/60">
                {selectedQuery.topPages.map((page) => (
                  <div key={page.page} className="py-3">
                    <p className="break-all text-sm font-medium">{page.path}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(locale, page.clicks)} {copy.labels.clicks} ·{' '}
                      {formatNumber(locale, page.impressions)} {copy.labels.impressions}
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
        description={copy.labels.googleLandingPageEvidence}
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
              {copy.labels.openPublicPage}
            </a>
            <div className="divide-y divide-border/50 border-y border-border/60">
              {selectedPage.topQueries.map((query) => (
                <div key={query.query} className="py-3">
                  <p className="text-sm font-medium">{query.query}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(locale, query.clicks)} {copy.labels.clicks} ·{' '}
                    {formatNumber(locale, query.impressions)} {copy.labels.impressions}
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
