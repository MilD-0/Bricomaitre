'use client';
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { cn } from '../../../lib/utils';
import { SearchField } from '../../search-field';
import { formatDzd as formatMoney, formatNumber, formatPercent } from '../analytics-format';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from '../analytics-presentation';
import { DenseTable, formatHours, Section } from '../analytics-workspace-primitives';
import type { CatalogViewView } from './catalog-view';
import { CatalogProduct, ProductScatterPoint, ProductScatterTooltip } from './use-catalog';
export function CatalogProducts({
  copy,
  selected,
  search,
  setSearch,
  portfolioPaidRatePct,
  locale,
  scatter,
  viewDomain,
  paidRateDomainMinimum,
  paidRateTicks,
  filtered,
  setSelectedId,
}: Pick<
  Parameters<typeof CatalogViewView>[0],
  | 'copy'
  | 'selected'
  | 'search'
  | 'setSearch'
  | 'portfolioPaidRatePct'
  | 'locale'
  | 'scatter'
  | 'viewDomain'
  | 'paidRateDomainMinimum'
  | 'paidRateTicks'
  | 'filtered'
  | 'setSelectedId'
>) {
  return (
    <Section
      title={copy.sections.products}
      analyticsFocus={{
        dimension: 'products',
        search: selected?.title ?? search,
        identifiers: selected ? [selected.id] : [],
      }}
      action={
        <SearchField
          value={search}
          placeholder={copy.labels.searchProduct}
          className="sm:w-72"
          onChange={setSearch}
        />
      }
    >
      <div className="mb-5" data-product-outcome-plot>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 text-[length:var(--type-size-label-px)] text-muted-foreground sm:px-3">
          <span>{copy.labels.scatterViews}</span>
          <span>{copy.labels.scatterPaidOutcome}</span>
          <span>{copy.labels.bubbleResolvedOrders}</span>
          {portfolioPaidRatePct != null ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-teal-700" /> {copy.labels.above}{' '}
                {formatPercent(locale, portfolioPaidRatePct)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-600" /> {copy.labels.below}{' '}
                {formatPercent(locale, portfolioPaidRatePct)}
              </span>
            </>
          ) : null}
        </div>
        {scatter.length ? (
          <ChartFrame className="h-[20rem]">
            <ResponsiveChart width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 34, bottom: 12, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeOpacity={0.45} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={copy.columns.views}
                  scale="log"
                  domain={viewDomain}
                  tickFormatter={(value) => formatNumber(locale, Number(value), true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize="var(--type-size-label-px)"
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={copy.labels.terminalPaidRate}
                  domain={[paidRateDomainMinimum, 105]}
                  ticks={paidRateTicks}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  fontSize="var(--type-size-label-px)"
                />
                <ZAxis type="number" dataKey="z" range={[42, 300]} />
                {portfolioPaidRatePct != null ? (
                  <ReferenceLine
                    y={portfolioPaidRatePct}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.65}
                  />
                ) : null}
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={<ProductScatterTooltip locale={locale} copy={copy} />}
                />
                <Scatter data={scatter} fill="var(--chart-violet)">
                  {scatter.map((row: ProductScatterPoint) => (
                    <Cell
                      key={row.id}
                      fill={
                        portfolioPaidRatePct != null && row.y >= portfolioPaidRatePct
                          ? 'var(--chart-teal)'
                          : 'var(--chart-amber)'
                      }
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveChart>
          </ChartFrame>
        ) : (
          <div className="flex h-48 items-center justify-center border-y border-border/50 text-sm text-muted-foreground">
            {copy.labels.insufficientProductOutcomes}
          </div>
        )}
      </div>
      <div className="divide-y divide-border/50 border-y border-border/60 sm:hidden">
        {filtered.slice(0, 12).map((product: CatalogProduct) => (
          <button
            key={product.id}
            type="button"
            onClick={() => setSelectedId(product.id)}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 text-start"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{product.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {formatNumber(locale, product.postedUnits)} {copy.labels.posted.toLowerCase()} ·{' '}
                {formatPercent(locale, product.terminalPaidRatePct)}{' '}
                {copy.labels.terminalPaid.toLowerCase()}
              </span>
            </span>
            <span className="text-end">
              <span className="block text-sm font-semibold tabular-nums">
                {formatMoney(locale, product.projectedContributionDzd)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatHours(locale, product.deliveryMedianHours)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <DenseTable className="hidden max-h-[42rem] overflow-y-auto sm:block">
        <TableHead>
          <tr>
            <th className="px-3 py-2 text-start">{copy.columns.name}</th>
            <th className="px-3 py-2 text-end">{copy.columns.views}</th>
            <th className="px-3 py-2 text-end">{copy.labels.postedUnits}</th>
            <th className="px-3 py-2 text-end">{copy.columns.paid}</th>
            <th className="px-3 py-2 text-end">{copy.labels.terminalPaid}</th>
            <th className="px-3 py-2 text-end">{copy.labels.projectedContribution}</th>
            <th className="px-3 py-2 text-end">{copy.labels.delivery}</th>
          </tr>
        </TableHead>
        <tbody className="divide-y divide-border/45">
          {filtered.slice(0, 60).map((product: CatalogProduct) => (
            <tr
              key={product.id}
              className="cursor-pointer hover:bg-muted/25"
              onClick={() => setSelectedId(product.id)}
            >
              <td className="max-w-80 px-3 py-2.5">
                <button
                  type="button"
                  className="block max-w-full truncate text-start font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(product.id);
                  }}
                >
                  {product.title}
                </button>
                <p className="truncate text-xs text-muted-foreground">
                  {product.sku ?? copy.labels.noSku} ·{' '}
                  {product.categoryName ?? copy.labels.uncategorized}
                </p>
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">
                {formatNumber(locale, product.viewCount)}
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">
                {formatNumber(locale, product.postedUnits)}
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">
                {formatNumber(locale, product.paidOrders)}
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">
                {formatPercent(locale, product.terminalPaidRatePct)}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-end font-medium tabular-nums',
                  product.projectedContributionDzd != null &&
                    product.projectedContributionDzd < 0 &&
                    'text-rose-600',
                )}
              >
                {formatMoney(locale, product.projectedContributionDzd)}
              </td>
              <td className="px-3 py-2.5 text-end tabular-nums">
                {formatHours(locale, product.deliveryMedianHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </DenseTable>
    </Section>
  );
}
