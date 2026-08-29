'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AnalyticsEntityLevel, AnalyticsPayload } from '../../lib/analytics';
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
import {
  formatDate,
  formatDzd as formatMoney,
  formatEur,
  formatNumber,
  formatPercent,
  formatRatio,
} from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import {
  ActualOpenLine,
  AnalyticsAssistantFocusContext,
  chartColors,
  chartTooltip,
  type DataOf,
  DenseTable,
  Funnel,
  MetricStrip,
  Section,
  splitPartialSeries,
} from './analytics-workspace-primitives';

export function AcquisitionView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'acquisition'>;
  filters: AnalyticsPayload['filters'];
  copy: AnalyticsCopy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<AnalyticsEntityLevel>('adset');
  const entityKey = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads';
  const entities = data.entities[entityKey];
  const daily = data.entityDaily[entityKey];
  const [selectionByLevel, setSelectionByLevel] = useState<Record<AnalyticsEntityLevel, string[]>>(
    () => ({
      campaign: data.entities.campaigns.slice(0, 3).map((entity) => entity.id),
      adset: data.entities.adsets.slice(0, 3).map((entity) => entity.id),
      ad: data.entities.ads.slice(0, 3).map((entity) => entity.id),
    }),
  );
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = entities.find((entity) => entity.id === inspectedId) ?? null;
  const availableIds = new Set(entities.map((entity) => entity.id));
  const selectedForLevel = selectionByLevel[level].filter((id) => availableIds.has(id));
  const selectedIds = selectedForLevel.length
    ? selectedForLevel
    : entities.slice(0, 3).map((entity) => entity.id);
  const selectedIdsKey = selectedIds.join('|');
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    setActiveAssistantFocus?.({
      dimension: entityKey,
      search: inspected?.name ?? null,
      identifiers: inspected ? [inspected.id] : selectedIdsKey.split('|').filter(Boolean),
    });
  }, [entityKey, inspected, selectedIdsKey, setActiveAssistantFocus]);
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: entityKey,
      search: inspected?.name ?? null,
      identifiers: inspected ? [inspected.id] : selectedIds,
    }),
  );

  function setSelectedIds(update: (current: string[]) => string[]) {
    setSelectionByLevel((current) => ({ ...current, [level]: update(selectedIds) }));
  }

  const comparison = (() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of daily) {
      if (!selectedIds.includes(row.id)) continue;
      const current = byDate.get(row.day) ?? { day: row.day };
      const index = selectedIds.indexOf(row.id);
      current[`series${index}`] = row.adCostDzd;
      byDate.set(row.day, current);
    }
    return [...byDate.values()].sort((left, right) =>
      String(left.day).localeCompare(String(right.day)),
    );
  })();
  const campaignNames = new Map(
    data.entities.campaigns.map((campaign) => [campaign.id, campaign.name]),
  );
  const maturationCampaigns = data.breakdowns.maturation.slice(0, 5);
  const maturationChart = [0, 3, 7, 14, 21].map((day) => ({
    day,
    ...Object.fromEntries(
      maturationCampaigns.map((campaign, index) => [
        `series${index}`,
        campaign.points.find((point) => point.day === day)?.paidRatePct ?? null,
      ]),
    ),
  }));
  const profitSeries = splitPartialSeries(
    data.profitSeries as Array<Record<string, string | number | boolean | null>>,
    ['profitXBeforeReturns', 'profitX'],
  );

  const syncMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since: filters.startDate, until: filters.endDate }),
      }),
    onSuccess: async () => {
      toast.success(copy.labels.metaInsightsSynchronized);
      await queryClient.invalidateQueries({ queryKey: ['stats-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <div className="grid xl:grid-cols-2">
        <Section
          title={copy.sections.profitEfficiency}
          analyticsFocus={{ dimension: 'profit_efficiency' }}
        >
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={profitSeries}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(value) => `${value}×`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale, 'ratio')} />
                <ReferenceLine y={1} stroke="#e11d48" strokeDasharray="5 4" />
                <ActualOpenLine
                  dataKey="profitXBeforeReturns"
                  name={copy.labels.beforeReturns}
                  stroke="#64748b"
                  strokeWidth={1.7}
                />
                <ActualOpenLine
                  dataKey="profitX"
                  name={copy.labels.afterReturns}
                  stroke="#7c3aed"
                  strokeWidth={2.4}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section title={copy.sections.creativeFatigue} analyticsFocus={{ dimension: 'meta_daily' }}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={data.daily}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis yAxisId="cpm" tickLine={false} axisLine={false} width={38} fontSize={11} />
                <YAxis
                  yAxisId="ctr"
                  orientation="right"
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize={11}
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar
                  yAxisId="cpm"
                  dataKey="cpmEur"
                  name={copy.labels.cpmEur}
                  fill="#d97706"
                  opacity={0.45}
                />
                <Line
                  yAxisId="ctr"
                  type="monotone"
                  dataKey="outboundCtrPct"
                  name={copy.columns.outboundCtr}
                  stroke="#2563eb"
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
      {data.summary.videoPlays > 0 ? (
        <Section
          title={copy.sections.creativeResponse}
          analyticsFocus={{ dimension: 'meta_daily' }}
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.7fr)]">
            <Funnel
              rows={[
                { name: copy.labels.played, value: data.summary.videoPlays },
                { name: '25%', value: data.summary.videoP25Watched },
                { name: '50%', value: data.summary.videoP50Watched },
                { name: '75%', value: data.summary.videoP75Watched },
                { name: copy.labels.completed, value: data.summary.videoP100Watched },
              ]}
              copy={copy}
              locale={locale}
            />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-6 text-sm lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
              <div>
                <dt className="text-muted-foreground">{copy.labels.playRate}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.videoPlayRatePct)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.labels.completion}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.videoCompletionRatePct)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.labels.averageWatch}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatNumber(locale, data.summary.videoAverageWatchSeconds)} s
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.labels.outboundCtr}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatPercent(locale, data.summary.outboundCtrPct)}
                </dd>
              </div>
            </dl>
          </div>
        </Section>
      ) : null}
      <Section title={copy.sections.paidFunnel} analyticsFocus={{ dimension: 'paid_funnel' }}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.7fr)]">
          <Funnel rows={data.funnel} copy={copy} locale={locale} />
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-6 text-sm lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
            <div>
              <dt className="text-muted-foreground">{copy.labels.confirmationRate}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.confirmationRatePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.labels.clickToPage}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.clickToPageRatePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.labels.metaPurchases}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatNumber(locale, data.summary.metaPurchases)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.labels.firstPartyOrders}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatNumber(locale, data.summary.bricOrders)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.labels.exactAdIdCoverage}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.exactAdAttributionCoveragePct)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.labels.outcomeMaturity}</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPercent(locale, data.efficiency.outcomeMaturityPct)}
              </dd>
            </div>
          </dl>
        </div>
      </Section>
      <Section
        title={copy.labels.campaignMaturation}
        analyticsFocus={{ dimension: 'attribution_maturation' }}
      >
        {maturationCampaigns.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {maturationCampaigns.map((campaign, index) => (
                <span
                  key={campaign.campaignId}
                  className="inline-flex max-w-56 items-center gap-1.5"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: chartColors[index] }}
                  />
                  <span className="truncate">
                    {campaignNames.get(campaign.campaignId) ?? campaign.campaignId}
                  </span>
                </span>
              ))}
            </div>
            <ChartFrame className="h-[20rem]">
              <ResponsiveChart width="100%" height="100%">
                <ComposedChart data={maturationChart}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => `D${value}`}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    fontSize={11}
                    domain={[0, 100]}
                  />
                  <Tooltip {...chartTooltip(locale, 'percent')} />
                  {maturationCampaigns.map((campaign, index) => (
                    <Line
                      key={campaign.campaignId}
                      type="monotone"
                      dataKey={`series${index}`}
                      name={campaignNames.get(campaign.campaignId) ?? campaign.campaignId}
                      stroke={chartColors[index]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveChart>
            </ChartFrame>
          </>
        ) : (
          <p className="border-y border-border/60 py-6 text-sm text-muted-foreground">
            {copy.noData}
          </p>
        )}
      </Section>
      <Section
        title={copy.sections.hierarchy}
        analyticsFocus={{
          dimension: entityKey,
          search: inspected?.name ?? null,
          identifiers: inspected ? [inspected.id] : selectedIds,
        }}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-muted/55 p-1">
              {(['campaign', 'adset', 'ad'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    level === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                  onClick={() => {
                    setLevel(key);
                    setInspectedId(null);
                  }}
                >
                  {copy.modes[key]}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.sync.canSyncActiveRange || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {syncMutation.isPending ? copy.syncing : copy.syncMeta}
            </Button>
          </div>
        }
      >
        {selectedIds.length ? (
          <div className="mb-5 border-b border-border/55 pb-5">
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {selectedIds.map((id, index) => (
                <span key={id} className="inline-flex max-w-52 items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: chartColors[index] }}
                  />
                  <span className="truncate">
                    {entities.find((entity) => entity.id === id)?.name ?? id}
                  </span>
                </span>
              ))}
            </div>
            <ChartFrame className="h-[15rem]">
              <ResponsiveChart width="100%" height="100%">
                <ComposedChart data={comparison}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatDate(locale, String(value))}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    fontSize={11}
                  />
                  <Tooltip {...chartTooltip(locale, 'money')} />
                  {selectedIds.map((id, index) => (
                    <Bar
                      key={id}
                      dataKey={`series${index}`}
                      stackId="spend"
                      name={entities.find((entity) => entity.id === id)?.name ?? id}
                      fill={chartColors[index]}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveChart>
            </ChartFrame>
          </div>
        ) : null}
        <DenseTable>
          <TableHead>
            <tr>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">{copy.compare}</span>
              </th>
              <th className="px-3 py-2 text-start">{copy.columns.name}</th>
              <th className="px-3 py-2 text-end">{copy.columns.spend}</th>
              <th className="px-3 py-2 text-end">{copy.columns.outboundCtr}</th>
              <th className="px-3 py-2 text-end">{copy.columns.posted}</th>
              <th className="px-3 py-2 text-end">{copy.labels.costPerPosted}</th>
              <th className="px-3 py-2 text-end">{copy.labels.costPerDelivered}</th>
              <th className="px-3 py-2 text-end">{copy.labels.costPerPaid}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {entities.slice(0, 100).map((entity) => {
              const selected = selectedIds.includes(entity.id);
              return (
                <tr
                  key={entity.id}
                  className="cursor-pointer hover:bg-muted/25"
                  onClick={() => setInspectedId(entity.id)}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={`${copy.compare} ${entity.name}`}
                      className={cn(
                        'grid size-5 place-items-center rounded border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedIds((current) =>
                          selected
                            ? current.filter((id) => id !== entity.id)
                            : current.length < 6
                              ? [...current, entity.id]
                              : current,
                        );
                      }}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </button>
                  </td>
                  <td className="max-w-72 px-3 py-2.5">
                    <p className="truncate font-medium">{entity.name}</p>
                    {level !== 'campaign' ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {entity.campaignName}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.adCostDzd)}
                    {entity.outcomeSpendCoveragePct != null ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {formatPercent(locale, entity.outcomeSpendCoveragePct)}{' '}
                        {copy.labels.outcomeWindow}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, entity.outboundCtrPct)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, entity.postedOrders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerPostedDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerDeliveredDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, entity.costPerPaidDzd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DenseTable>
      </Section>
      <Section
        title={copy.sections.trackingHealth}
        analyticsFocus={{ dimension: 'tracking_events' }}
      >
        <details className="border-y border-border/60 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {data.trackingHealth.available
              ? `${copy.sections.trackingHealth} · ${formatNumber(
                  locale,
                  data.trackingHealth.events.reduce((sum, row) => sum + row.total, 0),
                )} ${copy.labels.events}`
              : `${copy.sections.trackingHealth} · ${copy.labels.unavailable}`}
          </summary>
          {data.trackingHealth.available ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.trackingHealth.events.slice(0, 12).map((event) => (
                <div key={event.name}>
                  <p className="text-xs text-muted-foreground">{event.name}</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatNumber(locale, event.total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CAPI {formatNumber(locale, event.capiDelivered)} /{' '}
                    {formatNumber(locale, event.capiFailed)} {copy.labels.failed}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </details>
      </Section>
      <SidePanel
        open={Boolean(inspected)}
        onOpenChange={(open) => {
          if (!open) setInspectedId(null);
        }}
        title={inspected?.name ?? ''}
        description={inspected?.campaignName ?? undefined}
        closeLabel={copy.close}
      >
        {inspected ? (
          <div className="divide-y divide-border/60">
            {[
              [copy.labels.metaSpend, formatEur(locale, inspected.spendEur)],
              [copy.labels.adCostDzd, formatMoney(locale, inspected.adCostDzd)],
              [copy.labels.outcomeWindowCost, formatMoney(locale, inspected.attributedAdCostDzd)],
              [
                copy.labels.outcomeSpendCoverage,
                formatPercent(locale, inspected.outcomeSpendCoveragePct),
              ],
              [copy.labels.impressions, formatNumber(locale, inspected.impressions)],
              [copy.labels.outboundClicks, formatNumber(locale, inspected.outboundClicks)],
              [copy.labels.uniqueOutbound, formatNumber(locale, inspected.uniqueOutboundClicks)],
              [copy.labels.outboundCtr, formatPercent(locale, inspected.outboundCtrPct)],
              [copy.labels.landingViews, formatNumber(locale, inspected.landingPageViews)],
              [copy.labels.landingViewRate, formatPercent(locale, inspected.landingViewRatePct)],
              [copy.labels.videoPlays, formatNumber(locale, inspected.videoPlays)],
              [
                copy.labels.videoCompletion,
                formatPercent(locale, inspected.videoCompletionRatePct),
              ],
              [
                copy.labels.averageWatch,
                inspected.videoAverageWatchSeconds == null
                  ? '—'
                  : `${formatNumber(locale, inspected.videoAverageWatchSeconds)} s`,
              ],
              [copy.labels.qualityRanking, inspected.qualityRanking ?? '—'],
              [copy.labels.engagementRanking, inspected.engagementRateRanking ?? '—'],
              [copy.labels.conversionRanking, inspected.conversionRateRanking ?? '—'],
              [copy.labels.metaPurchases, formatNumber(locale, inspected.metaPurchases)],
              [copy.labels.bricOrders, formatNumber(locale, inspected.bricOrders)],
              [copy.labels.confirmed, formatNumber(locale, inspected.confirmedOrders)],
              [copy.labels.posted, formatNumber(locale, inspected.postedOrders)],
              [copy.labels.delivered, formatNumber(locale, inspected.deliveredOrders)],
              [copy.labels.paid, formatNumber(locale, inspected.paidOrders)],
              [copy.labels.returned, formatNumber(locale, inspected.returnedOrders)],
              [copy.labels.costPerPosted, formatMoney(locale, inspected.costPerPostedDzd)],
              [copy.labels.costPerDelivered, formatMoney(locale, inspected.costPerDeliveredDzd)],
              [copy.labels.costPerPaid, formatMoney(locale, inspected.costPerPaidDzd)],
              [copy.labels.projectedProfitX, formatRatio(locale, inspected.projectedProfitX)],
              [copy.labels.paidProfitX, formatRatio(locale, inspected.paidProfitX)],
              [copy.labels.profitCoverage, formatPercent(locale, inspected.profitCoveragePct)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="text-muted-foreground">{label}</span>
                <strong className="tabular-nums">{value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}
