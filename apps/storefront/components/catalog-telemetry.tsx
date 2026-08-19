'use client';

import { useEffect, useMemo, useRef } from 'react';

import type { Locale } from '@/i18n/config';
import { trackCatalogEvent } from '@/lib/analytics';
import { parseCatalogPageQuery, type CatalogPageQueryInput } from '@/lib/catalog-query';

type CatalogTelemetryProps = {
  locale: Locale;
  query: CatalogPageQueryInput;
  resultsCount: number;
  visibleProductIds: number[];
};

export function CatalogTelemetry({
  locale,
  query,
  resultsCount,
  visibleProductIds,
}: CatalogTelemetryProps) {
  const normalizedQuery = useMemo(() => parseCatalogPageQuery(query), [query]);
  const trackedKey = useRef('');

  useEffect(() => {
    const key = JSON.stringify([normalizedQuery, visibleProductIds]);
    if (trackedKey.current === key) return;
    trackedKey.current = key;

    const base = {
      locale,
      metadata: {
        resultsCount,
        page: normalizedQuery.page,
        sort: normalizedQuery.sort,
        discounted: normalizedQuery.discounted,
      },
    };
    void trackCatalogEvent({
      eventName: 'view_item_list',
      ...base,
      metadata: { ...base.metadata, visibleProductIds },
    });
    if (normalizedQuery.q)
      void trackCatalogEvent({ eventName: 'search', ...base, searchTerm: normalizedQuery.q });
    if (normalizedQuery.category)
      void trackCatalogEvent({
        eventName: 'filter_apply',
        ...base,
        categoryId: normalizedQuery.category,
        metadata: {
          ...base.metadata,
          filterKind: 'category',
          filterId: normalizedQuery.category,
        },
      });
    if (normalizedQuery.brand)
      void trackCatalogEvent({
        eventName: 'filter_apply',
        ...base,
        brandId: normalizedQuery.brand,
        metadata: { ...base.metadata, filterKind: 'brand', filterId: normalizedQuery.brand },
      });
    if (normalizedQuery.discounted)
      void trackCatalogEvent({
        eventName: 'filter_apply',
        ...base,
        metadata: { ...base.metadata, filterKind: 'discounted' },
      });
    if (normalizedQuery.sort !== 'recommended')
      void trackCatalogEvent({ eventName: 'sort_change', ...base });
  }, [locale, normalizedQuery, resultsCount, visibleProductIds]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target =
        event.target instanceof Element
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
        metadata: { position, page: normalizedQuery.page, sort: normalizedQuery.sort },
      });
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [locale, normalizedQuery.page, normalizedQuery.sort]);

  return null;
}
