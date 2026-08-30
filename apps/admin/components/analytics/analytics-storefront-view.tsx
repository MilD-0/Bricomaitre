'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';

import type { AnalyticsPayload } from '../../lib/analytics';
import { requestJson as request } from '../../lib/admin-api';
import { cn } from '../../lib/utils';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from './analytics-presentation';
import { formatDate, formatNumber, formatPercent } from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import {
  chartTooltip,
  type DataOf,
  DenseTable,
  Funnel,
  MetricStrip,
  Section,
} from './analytics-workspace-primitives';

export function StorefrontView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'storefront'>;
  filters: AnalyticsPayload['filters'];
  copy: AnalyticsCopy;
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
          | 'funnelRange'
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
        <Section title={copy.sections.siteTrend} analyticsFocus={{ dimension: 'storefront_trend' }}>
          <ChartFrame className="h-[23rem]">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={viewData.trend}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="traffic"
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="outcome"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale)} />
                <Area
                  yAxisId="traffic"
                  type="monotone"
                  dataKey="sessions"
                  name={copy.metrics.sessions}
                  fill="var(--chart-blue)"
                  fillOpacity={0.12}
                  stroke="var(--chart-blue)"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="outcome"
                  type="monotone"
                  dataKey="purchases"
                  name={copy.metrics.purchases}
                  stroke="var(--chart-teal)"
                  strokeWidth={2.3}
                  dot={false}
                />
                <Line
                  yAxisId="outcome"
                  type="monotone"
                  dataKey="errors"
                  name={copy.labels.errors}
                  stroke="var(--chart-rose)"
                  strokeWidth={1.6}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section
          title={copy.sections.siteFunnel}
          description={`${formatDate(locale, viewData.funnelRange.startDate, { long: true })} – ${formatDate(locale, viewData.funnelRange.endDate, { long: true })}`}
          analyticsFocus={{ dimension: 'storefront_funnel' }}
        >
          <Funnel rows={viewData.funnel} copy={copy} locale={locale} />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border/50 pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">{copy.labels.productViewToCartSessions}</p>
              <p className="mt-1 text-lg font-semibold">
                {formatPercent(
                  locale,
                  productSessions ? (cartSessions / productSessions) * 100 : null,
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{copy.labels.checkoutToSubmittedOrder}</p>
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
          analyticsFocus={{ dimension: 'storefront_paths' }}
          description={`${formatDate(locale, viewData.paths.coverageStartDate, { long: true })} – ${formatDate(locale, viewData.paths.coverageEndDate, { long: true })} · ${copy.labels.rawEventWindow}`}
        >
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.labels.from}</th>
                <th className="px-3 py-2 text-start">{copy.labels.to}</th>
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
        <Section
          title={copy.sections.searches}
          analyticsFocus={{ dimension: 'storefront_searches' }}
        >
          <div className="divide-y divide-border/50 border-y border-border/60">
            {viewData.searches
              .slice(0, 20)
              .map((row: { term: string; searches: number; zeroResults: number }) => (
                <div
                  key={row.term}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">{row.term || copy.labels.empty}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(locale, row.searches)}
                  </span>
                  <span
                    className={cn(
                      'min-w-16 text-end tabular-nums',
                      row.zeroResults > 0 && 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {formatNumber(locale, row.zeroResults)} {copy.labels.zeroResultsShort}
                  </span>
                </div>
              ))}
          </div>
        </Section>
      </div>
      <Section title={copy.sections.landingPages} analyticsFocus={{ dimension: 'landing_pages' }}>
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
        <Section
          title={copy.sections.experience}
          className="xl:col-span-2"
          analyticsFocus={{ dimension: 'web_vitals' }}
        >
          <div className="grid divide-y divide-border/50 border-y border-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {viewData.vitals.map(
              (vital: {
                name: string;
                samples: number;
                average: number;
                p75?: number;
                good: number;
                needsImprovement: number;
                poor: number;
              }) => (
                <div key={vital.name} className="px-4 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{vital.name}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {vital.name === 'CLS'
                      ? (vital.p75 ?? vital.average).toFixed(3)
                      : `${formatNumber(locale, vital.p75 ?? vital.average)} ms`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    p75 · {formatNumber(locale, vital.samples)} {copy.labels.samples} ·{' '}
                    {formatNumber(locale, vital.poor)} {copy.labels.poor}
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
                      {formatNumber(locale, source.sessions)} {copy.labels.sessions}
                    </span>
                    <span className="min-w-16 text-end font-medium tabular-nums">
                      {formatPercent(locale, source.conversionRate)}
                    </span>
                  </div>
                ),
              )}
          </div>
        </Section>
        <Section
          title={copy.labels.aiAssistedShopping}
          analyticsFocus={{ dimension: 'storefront_assistant' }}
        >
          <dl className="divide-y divide-border/50 border-y border-border/60 text-sm">
            {[
              [copy.labels.opens, viewData.aiAssistant.opens],
              [copy.labels.messages, viewData.aiAssistant.messages],
              [copy.labels.resultClicks, viewData.aiAssistant.resultClicks],
              [copy.labels.influencedOrders, viewData.aiAssistant.influencedOrders],
              [copy.labels.confirmed, viewData.aiAssistant.confirmedOrders],
              [copy.labels.paid, viewData.aiAssistant.paidOrders],
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
