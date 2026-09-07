'use client';
import { cn } from '../../../lib/utils';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from '../analytics-format';
import { AnalyticsTableHead as TableHead } from '../analytics-presentation';
import { DenseTable, Section } from '../analytics-workspace-primitives';
import type { MoneyViewView } from './money-view';
export function PaidEconomics({
  copy,
  locale,
  data,
}: Pick<Parameters<typeof MoneyViewView>[0], 'copy' | 'locale' | 'data'>) {
  return (
    <Section title={copy.sections.paidEconomics} analyticsFocus={{ dimension: 'paid_timeline' }}>
      <div className="mb-4 grid grid-cols-2 border-y border-border/60 lg:grid-cols-5">
        {[
          [copy.labels.paidCod, formatMoney(locale, data.automaticPaid.summary.codDzd)],
          [copy.labels.estimatedFees, formatMoney(locale, data.automaticPaid.summary.feesDzd)],
          [
            copy.labels.netRecovered,
            formatMoney(locale, data.automaticPaid.summary.netRecoveredDzd),
          ],
          [
            copy.metrics.automaticPaidProfit,
            formatMoney(locale, data.automaticPaid.summary.profitDzd),
          ],
          [
            copy.metrics.paidProfitCoverage,
            formatPercent(locale, data.automaticPaid.summary.profitCoveragePct),
          ],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-e border-border/45 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <DenseTable>
        <TableHead>
          <tr>
            <th className="px-3 py-2 text-start">{copy.columns.date}</th>
            <th className="px-3 py-2 text-end">{copy.columns.paid}</th>
            <th className="px-3 py-2 text-end">{copy.labels.cod}</th>
            <th className="px-3 py-2 text-end">{copy.labels.fees}</th>
            <th className="px-3 py-2 text-end">{copy.columns.profit}</th>
            <th className="px-3 py-2 text-end">{copy.columns.coverage}</th>
            <th className="px-3 py-2 text-end">{copy.labels.providerCod}</th>
          </tr>
        </TableHead>
        <tbody className="divide-y divide-border/45">
          {data.paidSeries
            .slice()
            .reverse()
            .slice(0, 90)
            .map((row) => (
              <tr key={row.bucket}>
                <td className="px-3 py-2.5 font-medium">
                  {formatDate(locale, row.bucket, { long: true })}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, row.paidOrders)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, row.codDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, row.feesDzd)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-end font-medium tabular-nums',
                    row.profitDzd < 0 && 'text-rose-600',
                  )}
                >
                  {formatMoney(locale, row.profitDzd)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, row.profitCoveragePct)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, row.providerAmountCoveragePct)}
                </td>
              </tr>
            ))}
        </tbody>
      </DenseTable>
    </Section>
  );
}
