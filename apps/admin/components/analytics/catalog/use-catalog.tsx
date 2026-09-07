'use client';

import { useContext, useEffect, useMemo, useState } from 'react';

import { analyticsFocusAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import type { AnalyticsCopy } from '../analytics-copy';
import { formatNumber, formatPercent } from '../analytics-format';
import { AnalyticsAssistantFocusContext, type DataOf } from '../analytics-workspace-primitives';

export type CatalogProduct = DataOf<'catalog'>['products'][number];
export type CatalogCustomer = DataOf<'catalog'>['customers']['rows'][number];
export type ProductScatterPoint = CatalogProduct & {
  x: number;
  y: number;
  z: number;
  resolvedOrders: number;
  outcomeCoveragePct: number;
};

export function ProductScatterTooltip({
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

export function useCatalogView({
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
  return {
    view: {
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
    } as const,
    fallback: null,
  };
}
