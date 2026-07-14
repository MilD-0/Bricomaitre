'use client';

import { useEffect, useRef } from 'react';

import type { Locale } from '@/i18n/config';
import { trackCatalogEvent } from '@/lib/analytics';
import type { CatalogPageQuery } from '@/lib/catalog-query';

type CatalogTelemetryProps = {
  locale: Locale;
  query: CatalogPageQuery;
  resultsCount: number;
  visibleProductIds: number[];
};

export function CatalogTelemetry({ locale, query, resultsCount, visibleProductIds }: CatalogTelemetryProps) {
  const trackedKey = useRef('');

  useEffect(() => {
    const key = JSON.stringify([query, visibleProductIds]);
    if (trackedKey.current === key) return;
    trackedKey.current = key;

    const base = { locale, metadata: { resultsCount, page: query.page, sort: query.sort } };
    void trackCatalogEvent({
      eventName: 'view_item_list',
      ...base,
      metadata: { ...base.metadata, visibleProductIds },
    });
    if (query.q) void trackCatalogEvent({ eventName: 'search', ...base, searchTerm: query.q });
    if (query.category) void trackCatalogEvent({
      eventName: 'filter_apply',
      ...base,
      categoryId: query.category,
      metadata: { ...base.metadata, filterKind: 'category', filterId: query.category },
    });
    if (query.brand) void trackCatalogEvent({
      eventName: 'filter_apply',
      ...base,
      brandId: query.brand,
      metadata: { ...base.metadata, filterKind: 'brand', filterId: query.brand },
    });
    if (query.sort !== 'newest') void trackCatalogEvent({ eventName: 'sort_change', ...base });
  }, [locale, query, resultsCount, visibleProductIds]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('[data-catalog-product]')
        : null;
      if (!target) return;
      const productId = Number(target.dataset.productId);
      const position = Number(target.dataset.position);
      if (!Number.isInteger(productId) || !Number.isInteger(position)) return;
      void trackCatalogEvent({
        eventName: 'select_item',
        locale,
        productId,
        productSlug: target.dataset.productSlug || null,
        categoryId: Number(target.dataset.categoryId) || null,
        brandId: Number(target.dataset.brandId) || null,
        metadata: { position, page: query.page, sort: query.sort },
      });
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [locale, query.page, query.sort]);

  return null;
}
