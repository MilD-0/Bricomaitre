'use client';

import { useEffect, useRef } from 'react';

import type { Locale } from '@/i18n/config';
import { trackCatalogEvent } from '@/lib/analytics';

export function SimilarProductsTelemetry({
  locale,
  productIds,
}: {
  locale: Locale;
  productIds: number[];
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void trackCatalogEvent({
      eventName: 'view_item_list',
      locale,
      metadata: {
        resultsCount: productIds.length,
        page: 1,
        sort: 'newest',
        listContext: 'similar_products',
        visibleProductIds: productIds.slice(0, 24),
      },
    });
  }, [locale, productIds]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('[data-similar-products] [data-catalog-product]')
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
        metadata: { position, page: 1, sort: 'newest', listContext: 'similar_products' },
      });
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [locale]);

  return null;
}
