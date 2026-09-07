'use client';
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
import { SidePanel } from '../../ui/side-panel';
import {
  formatDate,
  formatEur,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from '../analytics-format';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
} from '../analytics-presentation';
import {
  ActualOpenLine,
  chartColors,
  chartTooltip,
  Funnel,
  MetricStrip,
  Section,
} from '../analytics-workspace-primitives';
import { CampaignHierarchy } from './campaign-hierarchy';
import { type useAcquisitionView } from './use-acquisition';

export function AcquisitionViewView({
  data,
  copy,
  locale,
  profitSeries,
  maturationCampaigns,
  campaignNames,
  maturationChart,
  entityKey,
  inspected,
  selectedIds,
  level,
  setLevel,
  setInspectedId,
  syncMutation,
  entities,
  comparison,
  setSelectedIds,
}: NonNullable<ReturnType<typeof useAcquisitionView>['view']>) {
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
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  tickFormatter={(value) => `${value}×`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale, 'ratio')} />
                <ReferenceLine y={1} stroke="var(--chart-rose)" strokeDasharray="5 4" />
                <ActualOpenLine
                  dataKey="profitXBeforeReturns"
                  name={copy.labels.beforeReturns}
                  stroke="var(--chart-slate)"
                  strokeWidth={1.7}
                />
                <ActualOpenLine
                  dataKey="profitX"
                  name={copy.labels.afterReturns}
                  stroke="var(--chart-violet)"
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
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="cpm"
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  yAxisId="ctr"
                  orientation="right"
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar
                  yAxisId="cpm"
                  dataKey="cpmEur"
                  name={copy.labels.cpmEur}
                  fill="var(--chart-amber)"
                  opacity={0.45}
                />
                <Line
                  yAxisId="ctr"
                  type="monotone"
                  dataKey="outboundCtrPct"
                  name={copy.columns.outboundCtr}
                  stroke="var(--chart-blue)"
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
                    fontSize="var(--type-size-label-px)"
                  />
                  <YAxis
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    fontSize="var(--type-size-label-px)"
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
      <CampaignHierarchy
        copy={copy}
        entityKey={entityKey}
        inspected={inspected}
        selectedIds={selectedIds}
        level={level}
        setLevel={setLevel}
        setInspectedId={setInspectedId}
        data={data}
        syncMutation={syncMutation}
        entities={entities}
        comparison={comparison}
        locale={locale}
        setSelectedIds={setSelectedIds}
      />
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
