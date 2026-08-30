'use client';

import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts';

import { cn } from '../../lib/utils';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from './analytics-presentation';
import { formatDate, formatNumber, formatPercent } from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import {
  CashPipeline,
  chartTooltip,
  type DataOf,
  DenseTable,
  fulfillmentPhaseLabel,
  Funnel,
  MetricStrip,
  Section,
} from './analytics-workspace-primitives';

export function ReturnEvidence({
  returns,
  copy,
  locale,
}: {
  returns: DataOf<'fulfillment'>['returns'];
  copy: AnalyticsCopy;
  locale: string;
}) {
  return (
    <div className="grid divide-y divide-border/50 border-y border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.planning}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.planningRatePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.labels.manualModelInput}</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.mature}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.mature.ratePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNumber(locale, returns.mature.terminal)} {copy.labels.terminal} /{' '}
          {formatNumber(locale, returns.mature.eligibleOrders)} {copy.labels.eligible} ·{' '}
          {formatPercent(locale, returns.mature.terminalCoveragePct)} {copy.labels.resolved}
        </p>
        {returns.mature.cohortStartDate && returns.mature.cohortEndDate ? (
          <p className="mt-1 text-[length:var(--type-size-label-px)] text-muted-foreground/75">
            {formatDate(locale, returns.mature.cohortStartDate)}–
            {formatDate(locale, returns.mature.cohortEndDate)} {copy.labels.postingCohorts}
          </p>
        ) : null}
      </div>
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{copy.returnCopy.terminal}</p>
        <p className="mt-1 text-2xl font-semibold">
          {formatPercent(locale, returns.allTerminal.ratePct)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNumber(locale, returns.allTerminal.terminal)} {copy.labels.terminalOrders}
        </p>
      </div>
    </div>
  );
}

export function FulfillmentView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'fulfillment'>;
  copy: AnalyticsCopy;
  locale: string;
}) {
  type StateRow = {
    status: string;
    phase: string;
    orders: number;
    sharePct: number;
    staleOrders: number;
  };
  type AttemptRow = { band: string; outcome: string; orders: number };
  const phases = useMemo(() => {
    const result = new Map<string, number>();
    data.states
      .filter((row: StateRow) => row.phase !== 'untracked')
      .forEach((row: StateRow) => result.set(row.phase, (result.get(row.phase) ?? 0) + row.orders));
    return [...result.entries()].map(([key, value]) => ({ key, value }));
  }, [data.states]);
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section
        title={copy.sections.deliveryPipeline}
        analyticsFocus={{ dimension: 'shipment_states' }}
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
          <Funnel rows={phases} copy={copy} locale={locale} />
          <ReturnEvidence returns={data.returns} copy={copy} locale={locale} />
        </div>
      </Section>
      <Section title={copy.sections.cashPipeline} analyticsFocus={{ dimension: 'cash_pipeline' }}>
        <CashPipeline rows={data.cashPipeline} copy={copy} locale={locale} />
      </Section>
      <div>
        <Section
          title={copy.sections.shipmentStates}
          analyticsFocus={{ dimension: 'shipment_states' }}
        >
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.status}</th>
                <th className="px-3 py-2 text-end">{copy.columns.orders}</th>
                <th className="px-3 py-2 text-end">{copy.columns.share}</th>
                <th className="px-3 py-2 text-end">{copy.columns.stale}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.states.map((row: StateRow) => (
                <tr key={row.status}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{row.status.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {fulfillmentPhaseLabel(copy, row.phase)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, row.orders)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, row.sharePct)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-end tabular-nums',
                      row.staleOrders > 0 && 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {formatNumber(locale, row.staleOrders)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <div className="grid xl:grid-cols-2">
        <Section title={copy.sections.cohorts} analyticsFocus={{ dimension: 'posting_cohorts' }}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart data={[...data.cohorts].reverse()}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={(value) => formatDate(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar
                  dataKey="paid"
                  stackId="outcome"
                  name={copy.columns.paid}
                  fill="var(--chart-teal)"
                />
                <Bar
                  dataKey="returned"
                  stackId="outcome"
                  name={copy.columns.returned}
                  fill="var(--chart-rose)"
                />
                <Bar
                  dataKey="active"
                  stackId="outcome"
                  name={copy.labels.active}
                  fill="var(--chart-amber)"
                  opacity={0.65}
                />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
        <Section title={copy.sections.attempts} analyticsFocus={{ dimension: 'attempt_outcomes' }}>
          <ChartFrame>
            <ResponsiveChart width="100%" height="100%">
              <ComposedChart
                data={['0', '1', '2', '3', '4+'].map((band) => ({
                  band: band === '0' ? copy.labels.noEvent : band,
                  paid:
                    data.attempts.find(
                      (row: AttemptRow) => row.band === band && row.outcome === 'paid',
                    )?.orders ?? 0,
                  returned:
                    data.attempts.find(
                      (row: AttemptRow) => row.band === band && row.outcome === 'returned',
                    )?.orders ?? 0,
                }))}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="band"
                  tickLine={false}
                  axisLine={false}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize="var(--type-size-label-px)"
                />
                <Tooltip {...chartTooltip(locale)} />
                <Bar dataKey="paid" name={copy.columns.paid} fill="var(--chart-teal)" />
                <Bar dataKey="returned" name={copy.columns.returned} fill="var(--chart-rose)" />
              </ComposedChart>
            </ResponsiveChart>
          </ChartFrame>
        </Section>
      </div>
    </>
  );
}
