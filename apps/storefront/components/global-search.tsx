'use client';

import { ArrowUpRight, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import { getAdaptiveSearchDelay } from '@/components/catalog-live-search';
import { triggerHaptic } from '@/lib/haptics';
import { isDisplayableProductImageUrl } from '@/lib/product-images';
import { SearchResultsSkeleton } from '@/components/storefront-skeletons';
import { formatProductPrice } from '@/lib/product-presentation';

const searchProductSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().nullable(),
  mongoId: z.string().nullable(),
  title: z.string(),
  titleAr: z.string().nullable(),
  price: z.string().nullable(),
  inStock: z.boolean(),
  images: z.array(z.string()),
});

const searchResponseSchema = z.object({
  items: z.array(searchProductSchema),
});

type SearchProduct = z.infer<typeof searchProductSchema>;

export type GlobalSearchLabels = {
  label: string;
  placeholder: string;
  searching: string;
  results: string;
  noResults: string;
  viewAll: string;
  inStock: string;
  outOfStock: string;
};

export function GlobalSearch({
  locale,
  labels,
  instanceId = 'header',
}: {
  locale: Locale;
  labels: GlobalSearchLabels;
  instanceId?: string;
}) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputId = `global-product-search-${instanceId}`;
  const resultsId = `global-search-results-${instanceId}`;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function scheduleSearch(nextValue: string, inputType: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const query = nextValue.trim();
    if ([...query].length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    setLoading(true);
    setOpen(true);
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean };
      }
    ).connection;
    timerRef.current = setTimeout(
      async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('search unavailable');
          const parsed = searchResponseSchema.parse(await response.json());
          const items = parsed.items.slice(0, 5);
          setResults(items);
          void trackNavigationEvent({
            eventName: 'search',
            locale,
            searchTerm: query,
            metadata: { surface: 'global_search', resultsCount: items.length },
          });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setResults([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      getAdaptiveSearchDelay(nextValue, inputType, connection),
    );
  }

  return (
    <div className="global-search" ref={rootRef}>
      <form
        action={`/${locale}/products`}
        method="get"
        role="search"
        onSubmit={() => {
          setOpen(false);
          void trackNavigationEvent({
            eventName: 'search',
            locale,
            searchTerm: value.trim() || null,
            metadata: { surface: 'global_search', resultsCount: results.length },
          });
        }}
      >
        <Search className="global-search-icon" aria-hidden="true" size={19} strokeWidth={1.8} />
        <label className="sr-only" htmlFor={inputId}>
          {labels.label}
        </label>
        <input
          id={inputId}
          type="search"
          name="q"
          value={value}
          maxLength={80}
          autoComplete="off"
          placeholder={labels.placeholder}
          aria-label={labels.label}
          role="combobox"
          aria-expanded={open}
          aria-controls={resultsId}
          aria-busy={loading}
          onFocus={() => {
            if ([...value.trim()].length >= 2) setOpen(true);
          }}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValue(nextValue);
            scheduleSearch(nextValue, (event.nativeEvent as InputEvent).inputType || 'insertText');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              event.currentTarget.blur();
            }
            if (event.key === 'ArrowDown' && open) {
              event.preventDefault();
              rootRef.current?.querySelector<HTMLAnchorElement>('[data-search-result]')?.focus();
            }
          }}
        />
        <button type="submit" aria-label={labels.label}>
          <Search aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      </form>

      {open ? (
        <div className="global-search-panel" id={resultsId} aria-label={labels.results}>
          <p className="global-search-state" role="status" aria-live="polite">
            {loading ? labels.searching : results.length === 0 ? labels.noResults : labels.results}
          </p>
          {loading ? (
            <SearchResultsSkeleton />
          ) : results.length > 0 ? (
            <ul>
              {results.map((product, index) => {
                const token = product.slug || product.mongoId || String(product.id);
                const title =
                  locale === 'ar' && product.titleAr?.trim() ? product.titleAr : product.title;
                const image = product.images.find((url) => isDisplayableProductImageUrl(url));
                return (
                  <li key={product.id}>
                    <a
                      href={`/${locale}/products/${encodeURIComponent(token)}`}
                      data-search-result
                      onClick={() => {
                        void triggerHaptic('navigation');
                        void trackNavigationEvent({
                          eventName: 'select_item',
                          locale,
                          productId: product.id,
                          productSlug: token,
                          searchTerm: value.trim(),
                          metadata: {
                            surface: 'global_search',
                            target: token,
                            position: index + 1,
                          },
                        });
                      }}
                    >
                      <span className="global-search-thumb">
                        {image ? (
                          <StorefrontImage src={image} alt="" width={56} height={56} sizes="56px" />
                        ) : (
                          <span aria-hidden="true">B</span>
                        )}
                      </span>
                      <span className="global-search-copy">
                        <strong>{title}</strong>
                        <small className={product.inStock ? 'is-available' : 'is-unavailable'}>
                          {product.inStock ? labels.inStock : labels.outOfStock}
                        </small>
                      </span>
                      {product.price ? <b>{formatProductPrice(product.price, locale)}</b> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <a
            className="global-search-all"
            href={`/${locale}/products${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ''}`}
          >
            {labels.viewAll}
            <ArrowUpRight aria-hidden="true" size={17} />
          </a>
        </div>
      ) : null}
    </div>
  );
}
