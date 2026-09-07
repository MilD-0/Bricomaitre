'use client';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../../../lib/utils';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from '../analytics-format';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from '../analytics-presentation';
import {
  ActualOpenLine,
  chartTooltip,
  type DataOf,
  DenseTable,
  MetricStrip,
  Section,
} from '../analytics-workspace-primitives';
import { PaidEconomics } from './paid-economics';
import { type useMoneyView } from './use-money';

export function MoneyViewView({
  data,
  copy,
  locale,
  mode,
  setMode,
  chartData,
}: NonNullable<ReturnType<typeof useMoneyView>['view']>) {
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.moneyPerformance}
        analyticsFocus={{
          dimension: mode === 'realized' ? 'paid_timeline' : 'economics_timeline',
        }}
        action={
          <div className="flex rounded-lg bg-muted/55 p-1">
            {(['projected', 'realized', 'cumulative'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  mode === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {copy.modes[key]}
              </button>
            ))}
          </div>
        }
      >
        <ChartFrame className="h-[25rem]">
          <ResponsiveChart width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tickFormatter={(value) => formatDate(locale, String(value))}
                tickLine={false}
                axisLine={false}
                fontSize="var(--type-size-label-px)"
              />
              <YAxis
                tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                tickLine={false}
                axisLine={false}
                width={56}
                fontSize="var(--type-size-label-px)"
              />
              <Tooltip {...chartTooltip(locale, 'money')} />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              {mode === 'projected' ? (
                <>
                  <Bar
                    dataKey="adCostDzdDisplay"
                    name={copy.columns.adCost}
                    fill="var(--chart-amber)"
                    opacity={0.45}
                  />
                  <ActualOpenLine
                    dataKey="grossProfitDzd"
                    name={copy.columns.grossProfit}
                    stroke="var(--chart-slate)"
                    strokeWidth={1.5}
                  />
                  <ActualOpenLine
                    dataKey="adjustedProfitDzd"
                    name={copy.columns.adjustedProfit}
                    stroke="var(--chart-blue)"
                    strokeWidth={1.8}
                  />
                  <ActualOpenLine
                    dataKey="netProfitDzd"
                    name={copy.columns.netProfit}
                    stroke="var(--chart-violet)"
                    strokeWidth={2}
                  />
                  <ActualOpenLine
                    dataKey="trueProfitDzd"
                    name={copy.columns.trueProfit}
                    stroke="var(--chart-teal)"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
              {mode === 'realized' ? (
                <>
                  <Bar
                    dataKey="feesDzd"
                    name={copy.labels.ecoTrackFee}
                    fill="var(--chart-amber)"
                    opacity={0.45}
                  />
                  <ActualOpenLine
                    dataKey="codDzd"
                    name={copy.labels.paidCod}
                    stroke="var(--chart-blue)"
                    strokeWidth={1.6}
                  />
                  <ActualOpenLine
                    dataKey="profitDzd"
                    name={copy.metrics.automaticPaidProfit}
                    stroke="var(--chart-teal)"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
              {mode === 'cumulative' ? (
                <>
                  <ActualOpenLine
                    dataKey="cumulativeNetProfitDzd"
                    name={copy.columns.netProfit}
                    stroke="var(--chart-violet)"
                    strokeWidth={2}
                  />
                  <ActualOpenLine
                    dataKey="cumulativeTrueProfitDzd"
                    name={copy.columns.trueProfit}
                    stroke="var(--chart-teal)"
                    strokeWidth={2.4}
                  />
                </>
              ) : null}
            </ComposedChart>
          </ResponsiveChart>
        </ChartFrame>
      </Section>
      <PaidEconomics copy={copy} locale={locale} data={data} />
      <Section
        title={copy.labels.profitMaturation}
        analyticsFocus={{ dimension: 'posting_cohorts' }}
      >
        <ChartFrame className="h-[22rem]">
          <ResponsiveChart width="100%" height="100%">
            <ComposedChart
              data={data.cohorts.slice().reverse()}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.45} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={(value) => formatDate(locale, String(value))}
                tickLine={false}
                axisLine={false}
                fontSize="var(--type-size-label-px)"
              />
              <YAxis
                tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                tickLine={false}
                axisLine={false}
                width={52}
                fontSize="var(--type-size-label-px)"
              />
              <Tooltip {...chartTooltip(locale, 'money')} />
              <Bar
                dataKey="projectedTrueProfitDzd"
                name={copy.labels.projectedTrueProfit}
                fill="var(--chart-violet)"
                opacity={0.32}
              />
              <Bar
                dataKey="deliveredTrueProfitDzd"
                name={copy.labels.deliveredTrueProfit}
                fill="var(--chart-blue)"
                opacity={0.5}
              />
              <Bar
                dataKey="paidTrueProfitDzd"
                name={copy.labels.paidTrueProfit}
                fill="var(--chart-teal)"
              />
            </ComposedChart>
          </ResponsiveChart>
        </ChartFrame>
        <DenseTable className="mt-5">
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.labels.postingWeek}</th>
              <th className="px-3 py-2 text-end">{copy.labels.posted}</th>
              <th className="px-3 py-2 text-end">{copy.labels.delivered}</th>
              <th className="px-3 py-2 text-end">{copy.labels.paid}</th>
              <th className="px-3 py-2 text-end">{copy.labels.projected}</th>
              <th className="px-3 py-2 text-end">{copy.labels.paidProfit}</th>
              <th className="px-3 py-2 text-end">{copy.labels.variance}</th>
              <th className="px-3 py-2 text-end">{copy.labels.maturity}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.cohorts.slice(0, 18).map((cohort: DataOf<'money'>['cohorts'][number]) => (
              <tr key={cohort.weekStart} className={!cohort.mature ? 'bg-amber-500/5' : undefined}>
                <td className="px-3 py-2.5 font-medium">
                  {formatDate(locale, cohort.weekStart, { long: true })}
                  {!cohort.mature ? (
                    <span className="ms-2 text-[length:var(--type-size-micro-px)] text-amber-700">
                      {copy.labels.open}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.posted)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.delivered)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, cohort.paid)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, cohort.projectedTrueProfitDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, cohort.paidTrueProfitDzd)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-end font-medium tabular-nums',
                    cohort.varianceDzd != null && cohort.varianceDzd < 0 && 'text-rose-600',
                  )}
                >
                  {formatMoney(locale, cohort.varianceDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(
                    locale,
                    cohort.posted > 0
                      ? ((cohort.paid + cohort.returned) / cohort.posted) * 100
                      : null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>
      <div className="grid xl:grid-cols-2">
        <Section
          title={copy.sections.weeklyEconomics}
          analyticsFocus={{ dimension: 'friday_weeks' }}
        >
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.date}</th>
                <th className="px-3 py-2 text-end">{copy.columns.spend}</th>
                <th className="px-3 py-2 text-end">{copy.columns.profitX}</th>
                <th className="px-3 py-2 text-end">{copy.columns.trueProfit}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.weeks.slice(0, 12).map((week) => (
                <tr key={week.weekStart}>
                  <td className="px-3 py-2.5 font-medium">
                    {formatDate(locale, week.weekStart, { long: true })}
                    {week.isPartial ? (
                      <span className="ms-2 text-[length:var(--type-size-micro-px)] text-amber-700">
                        {copy.partialPeriod}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, week.adCostDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatRatio(locale, week.profitX)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end font-medium tabular-nums',
                      week.trueProfitDzd < 0 && 'text-rose-600',
                    )}
                  >
                    {formatMoney(locale, week.trueProfitDzd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
        <Section title={copy.sections.forecast} analyticsFocus={{ dimension: 'forecast' }}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={data.forecast}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  width={52}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale, 'money')} />
                <Area
                  dataKey="upperTrueProfitDzd"
                  name={copy.labels.upper}
                  fill="var(--chart-violet)"
                  fillOpacity={0.08}
                  stroke="none"
                />
                <Area
                  dataKey="lowerTrueProfitDzd"
                  name={copy.labels.lower}
                  fill="var(--background)"
                  stroke="none"
                />
                <Line
                  type="linear"
                  dataKey="forecastTrueProfitDzd"
                  name={copy.metrics.trueProfit}
                  stroke="var(--chart-violet)"
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
      <Section
        title={copy.sections.economicsLedger}
        analyticsFocus={{ dimension: 'economics_timeline' }}
      >
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.date}</th>
              <th className="px-3 py-2 text-end">{copy.columns.posted}</th>
              <th className="px-3 py-2 text-end">{copy.columns.grossProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.adjustedProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.adCost}</th>
              <th className="px-3 py-2 text-end">{copy.columns.trueProfit}</th>
              <th className="px-3 py-2 text-end">{copy.columns.coverage}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.series
              .slice()
              .reverse()
              .slice(0, 90)
              .map((row) => (
                <tr key={row.bucket} className={row.isPartial ? 'bg-amber-500/5' : undefined}>
                  <td className="px-3 py-2.5 font-medium">
                    {formatDate(locale, row.bucket, { long: true })}
                    {row.isPartial ? (
                      <span className="ms-2 text-[length:var(--type-size-micro-px)] text-amber-700">
                        {copy.partialPeriod}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.postedOrders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.grossProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.adjustedProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, row.adCostDzd)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end font-medium tabular-nums',
                      row.trueProfitDzd != null && row.trueProfitDzd < 0 && 'text-rose-600',
                    )}
                  >
                    {formatMoney(locale, row.trueProfitDzd)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.projectedCoveragePct)}
                  </td>
                </tr>
              ))}
          </tbody>
        </DenseTable>
      </Section>
    </>
  );
}
