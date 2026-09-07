'use client';

import { ChevronRight } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import type { AnalyticsView } from '../../../lib/analytics';
import { cn } from '../../../lib/utils';
import type { AnalyticsCopy } from '../analytics-copy';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from '../analytics-format';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
} from '../analytics-presentation';
import {
  ActualOpenLine,
  AnalyticsAssistantFocusContext,
  CashPipeline,
  chartTooltip,
  type DataOf,
  formatMetric,
  Funnel,
  MetricStrip,
  Section,
  splitPartialSeries,
} from '../analytics-workspace-primitives';

function signalTarget(key: string): AnalyticsView {
  if (key === 'returnAssumptionGap' || key === 'costCoverageGap') return 'assumptions';
  if (key === 'activePipeline') return 'fulfillment';
  return 'money';
}

export function CommandView({
  data,
  copy,
  locale,
  onNavigate,
}: {
  data: DataOf<'command'>;
  copy: AnalyticsCopy;
  locale: string;
  onNavigate: (view: AnalyticsView) => void;
}) {
  const trajectory = splitPartialSeries(
    data.trajectory as Array<Record<string, string | number | boolean | null>>,
    ['trueProfitDzd', 'automaticPaidProfitDzd'],
  );
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
        <Section
          title={copy.sections.trajectory}
          analyticsFocus={{ dimension: 'economics_timeline' }}
        >
          <ChartFrame className="h-[23rem]">
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={trajectory} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="commandTrueProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-violet)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-violet)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                  width={54}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale, 'money')} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="trueProfitDzdActual"
                  name={copy.metrics.trueProfit}
                  fill="url(#commandTrueProfit)"
                  stroke="none"
                  connectNulls={false}
                />
                <ActualOpenLine
                  dataKey="trueProfitDzd"
                  name={copy.metrics.trueProfit}
                  stroke="var(--chart-violet)"
                  strokeWidth={2.2}
                />
                <ActualOpenLine
                  dataKey="automaticPaidProfitDzd"
                  name={copy.metrics.automaticPaidProfit}
                  stroke="var(--chart-teal)"
                  strokeWidth={2.2}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">
                {formatMoney(locale, data.forecast.nextSevenDayTrueProfitDzd)}
              </b>{' '}
              {copy.labels.nextSevenDayModel}
            </span>
            <span>
              <b className="text-foreground">
                {formatPercent(locale, data.economics.coverage.projectedCoveragePct)}
              </b>{' '}
              {copy.metrics.paidProfitCoverage}
            </span>
            <span>
              <b className="text-foreground">
                {formatMoney(locale, data.economics.automaticPaid.summary.profitDzd)}
              </b>{' '}
              {copy.metrics.automaticPaidProfit}
            </span>
          </div>
        </Section>
        <div className="border-s border-border/60">
          <Section title={copy.sections.signals} analyticsFocus={{ dimension: 'signals' }}>
            <div className="divide-y divide-border/50 border-y border-border/60">
              {data.signals.map((signal) => (
                <button
                  key={signal.key}
                  type="button"
                  className="flex w-full items-start gap-3 py-3 text-start hover:bg-muted/25"
                  onClick={() => onNavigate(signalTarget(signal.key))}
                >
                  <span
                    className={cn(
                      'mt-1 size-2 shrink-0 rounded-full',
                      signal.severity === 'critical'
                        ? 'bg-rose-500'
                        : signal.severity === 'watch'
                          ? 'bg-amber-500'
                          : signal.severity === 'positive'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {copy.signalLabels[signal.key as keyof typeof copy.signalLabels] ??
                        signal.key}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMetric(locale, signal)}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
                </button>
              ))}
              {!data.signals.length ? (
                <p className="py-5 text-sm text-muted-foreground">{copy.noData}</p>
              ) : null}
            </div>
          </Section>
          <Section
            title={copy.sections.commerceFunnel}
            analyticsFocus={{ dimension: 'cash_pipeline' }}
          >
            <Funnel rows={data.fulfillment.funnel} copy={copy} locale={locale} />
          </Section>
        </div>
      </div>
      <Section title={copy.sections.cashPipeline} analyticsFocus={{ dimension: 'cash_pipeline' }}>
        <CashPipeline rows={data.fulfillment.cashPipeline} copy={copy} locale={locale} />
      </Section>
    </>
  );
}

export function useMoneyView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'money'>;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const [mode, setMode] = useState<'projected' | 'realized' | 'cumulative'>('projected');
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    setActiveAssistantFocus?.({
      dimension: mode === 'realized' ? 'paid_timeline' : 'economics_timeline',
    });
  }, [mode, setActiveAssistantFocus]);
  const sourceRows = (mode === 'realized' ? data.paidSeries : data.performanceSeries) as Array<
    Record<string, string | number | boolean | null>
  >;
  const chartData = splitPartialSeries(
    sourceRows,
    mode === 'realized'
      ? ['codDzd', 'profitDzd']
      : mode === 'cumulative'
        ? ['cumulativeNetProfitDzd', 'cumulativeTrueProfitDzd']
        : ['adCostDzd', 'grossProfitDzd', 'adjustedProfitDzd', 'netProfitDzd', 'trueProfitDzd'],
  );
  return { view: { data, copy, locale, mode, setMode, chartData } as const, fallback: null };
}
