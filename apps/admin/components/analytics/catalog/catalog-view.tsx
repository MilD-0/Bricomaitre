'use client';
import { SidePanel } from '../../ui/side-panel';
import { AlgeriaWilayaMap } from '../algeria-wilaya-map';
import {
  formatEur,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from '../analytics-format';
import { AnalyticsTableHead as TableHead } from '../analytics-presentation';
import {
  type DataOf,
  DenseTable,
  formatHours,
  MetricStrip,
  Section,
} from '../analytics-workspace-primitives';
import { CatalogProducts } from './catalog-products';
import { CatalogCustomer, type useCatalogView } from './use-catalog';

export function CatalogViewView({
  data,
  copy,
  locale,
  selected,
  search,
  setSearch,
  portfolioPaidRatePct,
  scatter,
  viewDomain,
  paidRateDomainMinimum,
  paidRateTicks,
  filtered,
  setSelectedId,
}: NonNullable<ReturnType<typeof useCatalogView>['view']>) {
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <CatalogProducts
        copy={copy}
        selected={selected}
        search={search}
        setSearch={setSearch}
        portfolioPaidRatePct={portfolioPaidRatePct}
        locale={locale}
        scatter={scatter}
        viewDomain={viewDomain}
        paidRateDomainMinimum={paidRateDomainMinimum}
        paidRateTicks={paidRateTicks}
        filtered={filtered}
        setSelectedId={setSelectedId}
      />
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
