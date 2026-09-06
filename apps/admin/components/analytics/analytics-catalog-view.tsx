'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
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

import { analyticsFocusAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { cn } from '../../lib/utils';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { SearchField } from '../search-field';
import { SidePanel } from '../ui/side-panel';
import {
  AnalyticsChartFrame as ChartFrame,
  AnalyticsResponsiveChart as ResponsiveChart,
  AnalyticsTableHead as TableHead,
} from './analytics-presentation';
import {
  formatDzd as formatMoney,
  formatEur,
  formatNumber,
  formatPercent,
} from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import { AlgeriaWilayaMap } from './algeria-wilaya-map';
import {
  AnalyticsAssistantFocusContext,
  type DataOf,
  DenseTable,
  formatHours,
  MetricStrip,
  Section,
} from './analytics-workspace-primitives';

type CatalogProduct = DataOf<'catalog'>['products'][number];
type CatalogCustomer = DataOf<'catalog'>['customers']['rows'][number];
type ProductScatterPoint = CatalogProduct & {
  x: number;
  y: number;
  z: number;
  resolvedOrders: number;
  outcomeCoveragePct: number;
};

function ProductScatterTooltip({
  active,
  payload,
  locale,
  copy,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ProductScatterPoint }>;
  locale: string;
  copy: AnalyticsCopy;
}) {
  const product = payload?.[0]?.payload;
  if (!active || !product) return null;
  return (
    <div className="min-w-56 border border-border/70 bg-background/95 p-3 text-xs shadow-lg">
      <p className="max-w-72 font-semibold leading-5">{product.title}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-muted-foreground">
        <span>{copy.labels.productViews}</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.viewCount)}
        </strong>
        <span>{copy.labels.terminalPaid}</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatPercent(locale, product.terminalPaidRatePct)}
        </strong>
        <span>{copy.labels.paidReturned}</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.paidOrders)} /{' '}
          {formatNumber(locale, product.returnedOrders)}
        </strong>
        <span>{copy.labels.stillActive}</span>
        <strong className="text-end text-foreground tabular-nums">
          {formatNumber(locale, product.activeOrders)}
        </strong>
      </div>
    </div>
  );
}

export function CatalogView({
  data,
  copy,
  locale,
}: {
  data: DataOf<'catalog'>;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    if (!term) return data.products;
    return data.products.filter((product: CatalogProduct) =>
      `${product.title} ${product.sku ?? ''} ${product.categoryName ?? ''} ${product.brandName ?? ''}`
        .toLocaleLowerCase(locale)
        .includes(term),
    );
  }, [data.products, locale, search]);
  const selected =
    data.products.find((product: CatalogProduct) => product.id === selectedId) ?? null;
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    setActiveAssistantFocus?.({
      dimension: 'products',
      search: selected?.title ?? search,
      identifiers: selected ? [selected.id] : [],
    });
  }, [search, selected, setActiveAssistantFocus]);
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: 'products',
      search: selected?.title ?? search,
      identifiers: selected ? [selected.id] : [],
    }),
  );
  const scatter = filtered
    .map((product: CatalogProduct): ProductScatterPoint => {
      const resolvedOrders = product.paidOrders + product.returnedOrders;
      const measuredOrders = resolvedOrders + product.activeOrders;
      return {
        ...product,
        x: product.viewCount ?? 0,
        y: product.terminalPaidRatePct ?? 0,
        z: resolvedOrders,
        resolvedOrders,
        outcomeCoveragePct: measuredOrders > 0 ? (resolvedOrders / measuredOrders) * 100 : 0,
      };
    })
    .filter(
      (product: ProductScatterPoint) =>
        product.x > 0 &&
        product.terminalPaidRatePct != null &&
        product.resolvedOrders >= 10 &&
        product.outcomeCoveragePct >= 50,
    )
    .sort(
      (left: ProductScatterPoint, right: ProductScatterPoint) =>
        right.resolvedOrders - left.resolvedOrders,
    )
    .slice(0, 80);
  const resolvedPaidOrders = scatter.reduce(
    (sum: number, product: ProductScatterPoint) => sum + product.paidOrders,
    0,
  );
  const resolvedOrders = scatter.reduce(
    (sum: number, product: ProductScatterPoint) => sum + product.resolvedOrders,
    0,
  );
  const portfolioPaidRatePct =
    resolvedOrders > 0 ? (resolvedPaidOrders / resolvedOrders) * 100 : null;
  const minimumPaidRatePct = scatter.length
    ? Math.min(...scatter.map((product: ProductScatterPoint) => product.y))
    : 0;
  const paidRateDomainMinimum = Math.max(0, Math.floor(minimumPaidRatePct / 10) * 10 - 10);
  const paidRateTicks = Array.from(
    new Set(
      [paidRateDomainMinimum, 50, 75, 100].filter(
        (value) => value >= paidRateDomainMinimum && value <= 100,
      ),
    ),
  );
  const minimumViews = scatter.length
    ? Math.min(...scatter.map((product: ProductScatterPoint) => product.x))
    : 1;
  const maximumViews = scatter.length
    ? Math.max(...scatter.map((product: ProductScatterPoint) => product.x))
    : 1;
  const viewDomain: [number, number] = [
    Math.max(1, minimumViews * 0.8),
    Math.max(maximumViews * 1.2, minimumViews + 1),
  ];
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
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
      <Section title={copy.sections.geography}>
        <AlgeriaWilayaMap rows={data.geography.wilayas} locale={locale} />
        {data.geography.metaRegions.length ? (
          <div className="mt-6 border-y border-border/60">
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
                {copy.labels.metaReportedRegions}
              </p>
              <p className="text-[length:var(--type-size-label-px)] text-muted-foreground">
                {copy.labels.aggregateMediaGeography}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              {data.geography.metaRegions
                .slice(0, 8)
                .map((region: DataOf<'catalog'>['geography']['metaRegions'][number]) => (
                  <div key={region.name} className="border-t border-e border-border/45 px-3 py-3">
                    <p className="truncate text-sm font-medium">{region.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatEur(locale, region.spendEur)} ·{' '}
                      {formatPercent(locale, region.outboundCtrPct)} {copy.labels.outboundCtr}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.labels.wilaya}</th>
                <th className="px-3 py-2 text-end">{copy.labels.posted}</th>
                <th className="px-3 py-2 text-end">{copy.labels.terminalPaid}</th>
                <th className="px-3 py-2 text-end">{copy.labels.delivery}</th>
                <th className="px-3 py-2 text-end">{copy.labels.attempts}</th>
                <th className="px-3 py-2 text-end">{copy.labels.pipelineCod}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.geography.wilayas.slice(0, 30).map((wilaya) => (
                <tr key={`${wilaya.wilayaId}-${wilaya.name}`}>
                  <td className="px-3 py-2.5 font-medium">{wilaya.name}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, wilaya.postedOrders)}
                    {wilaya.untrackedOrders > 0 ? (
                      <span className="mt-0.5 block text-[length:var(--type-size-micro-px)] text-amber-700 dark:text-amber-400">
                        {formatNumber(locale, wilaya.untrackedOrders)} {copy.labels.untracked}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(locale, wilaya.terminalPaidRatePct)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatHours(locale, wilaya.deliveryMedianHours)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(locale, wilaya.averageAttempts)}
                  </td>
                  <td className="px-3 py-2.5 text-end font-medium tabular-nums">
                    {formatMoney(locale, wilaya.pipelineCodDzd)}
                    {wilaya.pipelineCodDzd > 0 ? (
                      <span className="mt-0.5 block text-[length:var(--type-size-micro-px)] font-normal text-muted-foreground">
                        {formatPercent(locale, wilaya.providerAmountValueCoveragePct)}{' '}
                        {copy.labels.provider}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.labels.commune}</th>
                <th className="px-3 py-2 text-start">{copy.labels.wilaya}</th>
                <th className="px-3 py-2 text-end">{copy.labels.posted}</th>
                <th className="px-3 py-2 text-end">{copy.labels.terminalPaid}</th>
                <th className="px-3 py-2 text-end">{copy.labels.delivery}</th>
                <th className="px-3 py-2 text-end">{copy.labels.attempts}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.geography.communes
                .slice(0, 40)
                .map((commune: DataOf<'catalog'>['geography']['communes'][number]) => (
                  <tr key={`${commune.wilayaId}-${commune.name}`}>
                    <td className="max-w-52 truncate px-3 py-2.5 font-medium">{commune.name}</td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">
                      {commune.wilayaName}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, commune.postedOrders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, commune.terminalPaidRatePct)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatHours(locale, commune.deliveryMedianHours)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, commune.averageAttempts)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </DenseTable>
        </div>
      </Section>
      <div className="grid xl:grid-cols-[minmax(16rem,0.45fr)_minmax(0,1.55fr)]">
        <Section title={copy.sections.basketPairs} analyticsFocus={{ dimension: 'basket_pairs' }}>
          <div className="divide-y divide-border/50 border-y border-border/60">
            {data.basketPairs.map((pair: { left: string; right: string; orders: number }) => (
              <div
                key={`${pair.left}-${pair.right}`}
                className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-sm"
              >
                <p className="min-w-0">
                  <span className="block truncate font-medium">{pair.left}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    + {pair.right}
                  </span>
                </p>
                <strong className="tabular-nums">{formatNumber(locale, pair.orders)}</strong>
              </div>
            ))}
          </div>
        </Section>
        <Section title={copy.sections.customerBase} analyticsFocus={{ dimension: 'customers' }}>
          <div className="grid grid-cols-2 border-y border-border/60">
            {[
              [copy.labels.customers, formatNumber(locale, data.customers.summary.customers)],
              [
                copy.labels.secondOrderConversion,
                formatPercent(locale, data.customers.summary.secondOrderConversionPct),
              ],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-e border-border/45 px-3 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <DenseTable className="mt-5">
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.labels.customer}</th>
                <th className="px-3 py-2 text-start">{copy.labels.city}</th>
                <th className="px-3 py-2 text-end">{copy.labels.submitted}</th>
                <th className="px-3 py-2 text-end">{copy.labels.paid}</th>
                <th className="px-3 py-2 text-end">{copy.labels.paidRevenue}</th>
                <th className="px-3 py-2 text-end">{copy.labels.contribution}</th>
                <th className="px-3 py-2 text-end">{copy.labels.margin}</th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.customers.rows
                .slice()
                .sort(
                  (left: CatalogCustomer, right: CatalogCustomer) =>
                    right.orders - left.orders || right.totalValue - left.totalValue,
                )
                .slice(0, 50)
                .map((customer: CatalogCustomer, index: number) => (
                  <tr key={`${customer.name}-${customer.firstOrderAt}-${index}`}>
                    <td className="max-w-48 truncate px-3 py-2.5 font-medium">{customer.name}</td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">
                      {customer.city}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, customer.orders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatNumber(locale, customer.paidOrders)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatMoney(locale, customer.paidValueDzd)}
                    </td>
                    <td className="px-3 py-2.5 text-end font-medium tabular-nums">
                      {formatMoney(locale, customer.contributionLtvDzd)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {formatPercent(locale, customer.paidContributionMarginPct)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <SidePanel
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={selected?.title ?? ''}
        description={[selected?.sku, selected?.brandName, selected?.categoryName]
          .filter(Boolean)
          .join(' · ')}
        closeLabel={copy.close}
      >
        {selected ? (
          <div className="divide-y divide-border/60">
            <div className="grid grid-cols-2 gap-4 p-5">
              {[
                [copy.columns.views, formatNumber(locale, selected.viewCount)],
                [copy.labels.postedOrders, formatNumber(locale, selected.postedOrders)],
                [copy.labels.postedUnits, formatNumber(locale, selected.postedUnits)],
                [copy.labels.paidOrders, formatNumber(locale, selected.paidOrders)],
                [copy.labels.returnedOrders, formatNumber(locale, selected.returnedOrders)],
                [copy.labels.stillActive, formatNumber(locale, selected.activeOrders)],
                [copy.labels.terminalPaidRate, formatPercent(locale, selected.terminalPaidRatePct)],
                [copy.labels.costCoverage, formatPercent(locale, selected.costCoveragePct)],
                [
                  copy.labels.projectedContribution,
                  formatMoney(locale, selected.projectedContributionDzd),
                ],
                [copy.labels.medianDelivery, formatHours(locale, selected.deliveryMedianHours)],
                [copy.columns.conversion, formatPercent(locale, selected.websiteConversionRate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
                {copy.labels.exactMetaAssociations}
              </p>
              {selected.metaAssociations.length ? (
                <div className="mt-3 divide-y divide-border/50 border-y border-border/60">
                  {selected.metaAssociations.map((association) => (
                    <div
                      key={association.adId}
                      className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {association.adName ?? association.adId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {association.campaignName ??
                            association.campaignId ??
                            copy.labels.unknownCampaign}{' '}
                          ·{' '}
                          {association.adsetName ?? association.adsetId ?? copy.labels.unknownAdSet}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-semibold tabular-nums">
                          {formatNumber(locale, association.attributedOrders)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(locale, association.paidOrders)}{' '}
                          {copy.labels.paid.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {copy.labels.noExactAdAssociation}
                </p>
              )}
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
                {copy.labels.periodChange}
              </p>
              <div className="mt-3">
                <div>
                  <p className="text-xs text-muted-foreground">{copy.labels.units}</p>
                  <p className="mt-1 font-semibold">
                    {formatPercent(locale, selected.changes.unitsPct)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}
