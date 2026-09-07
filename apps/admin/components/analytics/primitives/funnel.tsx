'use client';
import type { AnalyticsCashStage } from '../../../lib/analytics';
import { type AnalyticsCopy } from '../analytics-copy';
import { formatDzd as formatMoney, formatNumber, formatPercent } from '../analytics-format';
import { funnelLabel } from './format';

export function Funnel({
  rows,
  copy,
  locale,
}: {
  rows: Array<{ key?: string; name?: string; value: number }>;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={row.key ?? row.name ?? index}
          className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-muted-foreground">
            {funnelLabel(copy, row.name ?? row.key ?? '')}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </span>
          <strong className="min-w-12 text-end tabular-nums">
            {formatNumber(locale, row.value)}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function CashPipeline({
  rows,
  copy,
  locale,
}: {
  rows: AnalyticsCashStage[];
  copy: AnalyticsCopy;
  locale: string;
}) {
  const visibleRows = rows.filter(
    (row) =>
      row.orders > 0 ||
      row.amountDzd > 0 ||
      (row.providerAmountCoveragePct != null && row.providerAmountCoveragePct > 0),
  );

  if (!visibleRows.length) return null;

  return (
    <div
      role="region"
      aria-label={copy.sections.cashPipeline}
      tabIndex={0}
      className="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(14rem,80vw)] overflow-x-auto border-y border-border/60 outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-inset focus-visible:ring-ring/30 sm:snap-none sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible xl:flex"
    >
      {visibleRows.map((row) => (
        <div
          key={row.key}
          className="min-w-0 snap-start border-e border-border/45 px-4 py-4 last:border-e-0 sm:border-b xl:flex-1 xl:border-b-0"
        >
          <p className="min-h-8 text-xs font-medium leading-4 text-muted-foreground">
            {copy.cashStages[row.key]}
          </p>
          <p className="mt-1 text-xl font-semibold tracking-[var(--type-tracking-n025)]">
            {formatMoney(locale, row.amountDzd, true)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--type-size-label-px)] text-muted-foreground">
            <span>
              {formatNumber(locale, row.orders)} {copy.columns.orders}
            </span>
          </div>
          {row.confidencePct != null ? (
            <p className="mt-1 text-[length:var(--type-size-micro-px)] text-muted-foreground/75">
              {formatPercent(locale, row.confidencePct)} {copy.expectedToPost}
            </p>
          ) : row.providerAmountCoveragePct != null ? (
            <p className="mt-1 text-[length:var(--type-size-micro-px)] text-muted-foreground/75">
              {formatPercent(locale, row.providerAmountCoveragePct)} {copy.providerCodCoverage}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
