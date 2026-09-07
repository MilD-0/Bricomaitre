'use client';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from '../analytics-format';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from '../analytics-presentation';
import { chartColors, chartTooltip, DenseTable, Section } from '../analytics-workspace-primitives';
import type { AcquisitionViewView } from './acquisition-view';
export function CampaignHierarchy({
  copy,
  entityKey,
  inspected,
  selectedIds,
  level,
  setLevel,
  setInspectedId,
  data,
  syncMutation,
  entities,
  comparison,
  locale,
  setSelectedIds,
}: Pick<
  Parameters<typeof AcquisitionViewView>[0],
  | 'copy'
  | 'entityKey'
  | 'inspected'
  | 'selectedIds'
  | 'level'
  | 'setLevel'
  | 'setInspectedId'
  | 'data'
  | 'syncMutation'
  | 'entities'
  | 'comparison'
  | 'locale'
  | 'setSelectedIds'
>) {
  return (
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
                <span className="size-2 rounded-full" style={{ background: chartColors[index] }} />
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
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  fontSize="var(--type-size-label-px)"
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
                    aria-pressed={selected}
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
                  <button
                    type="button"
                    className="block max-w-full truncate text-start font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={(event) => {
                      event.stopPropagation();
                      setInspectedId(entity.id);
                    }}
                  >
                    {entity.name}
                  </button>
                  {level !== 'campaign' ? (
                    <p className="truncate text-xs text-muted-foreground">{entity.campaignName}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, entity.adCostDzd)}
                  {entity.outcomeSpendCoveragePct != null ? (
                    <span className="mt-0.5 block text-[length:var(--type-size-micro-px)] text-muted-foreground">
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
  );
}
