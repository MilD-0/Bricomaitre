'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CatalogCard, type CatalogCardLabels, type CatalogProduct } from '@/components/catalog-card';
import { CatalogCardSkeleton } from '@/components/storefront-skeletons';
import type { Locale } from '@/i18n/config';
import { trackCatalogEvent } from '@/lib/analytics';
import { buildCatalogApiPath, type CatalogPageQuery } from '@/lib/catalog-query';

type StoredCatalogState = {
  items: CatalogProduct[];
  page: number;
  hasNextPage: boolean;
  totalCount: number;
  scrollY: number;
};

const MAX_PERSISTED_ITEMS = 240;

function uniqueCatalogProducts(items: unknown[], excludedIds: Iterable<number> = []) {
  const seenIds = new Set(excludedIds);

  return items.filter((item): item is CatalogProduct => {
    if (!item || typeof item !== 'object' || !Number.isInteger((item as CatalogProduct).id)) return false;
    const id = (item as CatalogProduct).id;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}

function getStorageKey() {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  return `bric:catalog-position:v2:${url.pathname}${url.search}`;
}

function readStoredState(): StoredCatalogState | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(getStorageKey()) ?? 'null') as Partial<StoredCatalogState> | null;
    if (!value || !Array.isArray(value.items) || !Number.isInteger(value.page) || typeof value.hasNextPage !== 'boolean' || !Number.isInteger(value.totalCount)) return null;
    return {
      items: uniqueCatalogProducts(value.items).slice(0, MAX_PERSISTED_ITEMS),
      page: value.page as number,
      hasNextPage: value.hasNextPage,
      totalCount: value.totalCount as number,
      scrollY: Number.isFinite(value.scrollY) && (value.scrollY as number) >= 0 ? value.scrollY as number : 0,
    };
  } catch {
    return null;
  }
}

export function CatalogInfiniteLoader({
  locale,
  query,
  initialCount,
  initialProductIds,
  initialHasNextPage,
  totalCount,
  brandNames,
  categoryNames,
  pageSize = 24,
  listContext = 'catalog',
  labels,
}: {
  locale: Locale;
  query: CatalogPageQuery;
  initialCount: number;
  initialProductIds: number[];
  initialHasNextPage: boolean;
  totalCount: number;
  brandNames: Record<number, string>;
  categoryNames: Record<number, string>;
  pageSize?: number;
  listContext?: 'catalog' | 'similar_products';
  labels: CatalogCardLabels & {
    loadMore: string;
    loading: string;
    loadError: string;
    end: string;
  };
}) {
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(query.page);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(true);
  const loadingRef = useRef(false);
  const pageRef = useRef(query.page);
  const hasNextPageRef = useRef(initialHasNextPage);

  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const stored = readStoredState();
    if (!stored || stored.page < query.page || stored.totalCount !== totalCount) {
      pageRef.current = query.page;
      hasNextPageRef.current = initialHasNextPage;
      restoringRef.current = false;
      return () => { history.scrollRestoration = previousRestoration; };
    }

    pageRef.current = stored.page;
    hasNextPageRef.current = stored.hasNextPage;
    setItems(uniqueCatalogProducts(stored.items, initialProductIds));
    setPage(stored.page);
    setHasNextPage(stored.hasNextPage);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: stored.scrollY, behavior: 'auto' });
      restoringRef.current = false;
    }));

    return () => { history.scrollRestoration = previousRestoration; };
  }, [initialHasNextPage, initialProductIds, query.page, totalCount]);

  useEffect(() => {
    let frame = 0;
    function persist() {
      if (restoringRef.current) return;
      try {
        window.sessionStorage.setItem(getStorageKey(), JSON.stringify({
          items: items.slice(0, MAX_PERSISTED_ITEMS),
          page,
          hasNextPage,
          totalCount,
          scrollY: window.scrollY,
        } satisfies StoredCatalogState));
      } catch {
        // Position restoration is a non-blocking enhancement.
      }
    }
    function handleScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(persist);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    persist();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', persist);
    };
  }, [hasNextPage, items, page, totalCount]);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasNextPageRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    const nextPage = pageRef.current + 1;
    try {
      const response = await fetch(buildCatalogApiPath(query, nextPage, pageSize), { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('catalog page unavailable');
      const payload = await response.json() as { items?: CatalogProduct[]; page?: number; hasNextPage?: boolean };
      if (!Array.isArray(payload.items) || payload.page !== nextPage || typeof payload.hasNextPage !== 'boolean') {
        throw new Error('invalid catalog page');
      }
      const nextItems = uniqueCatalogProducts(payload.items, [
        ...initialProductIds,
        ...items.map((item) => item.id),
      ]);
      setItems((current) => [
        ...current,
        ...uniqueCatalogProducts(nextItems, [
          ...initialProductIds,
          ...current.map((item) => item.id),
        ]),
      ]);
      pageRef.current = nextPage;
      hasNextPageRef.current = payload.hasNextPage;
      setPage(nextPage);
      setHasNextPage(payload.hasNextPage);
      void trackCatalogEvent({
        eventName: 'view_item_list',
        locale,
        metadata: {
          resultsCount: nextItems.length,
          page: nextPage,
          sort: query.sort,
          listContext,
          visibleProductIds: nextItems.map((item) => item.id).slice(0, 24),
        },
      });
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [initialProductIds, items, listContext, locale, pageSize, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
    }, { rootMargin: '500px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, loadNextPage]);

  return (
    <>
      {items.map((product, index) => (
        <CatalogCard
          key={product.id}
          product={product}
          locale={locale}
          position={initialCount + index + 1}
          brandName={product.brandId ? brandNames[product.brandId] : null}
          categoryName={product.categoryId ? categoryNames[product.categoryId] : null}
          labels={labels}
        />
      ))}
      {loading ? <><CatalogCardSkeleton /><CatalogCardSkeleton /></> : null}
      <div className="catalog-infinite-sentinel" ref={sentinelRef} aria-live="polite">
        {hasNextPage ? (
          <button type="button" className="catalog-load-more" onClick={() => void loadNextPage()} disabled={loading}>
            {loading ? labels.loading : labels.loadMore}
          </button>
        ) : items.length > 0 ? <span>{labels.end}</span> : null}
        {error ? <p role="status">{labels.loadError}</p> : null}
      </div>
    </>
  );
}
