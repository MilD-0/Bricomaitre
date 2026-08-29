import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogInfiniteLoader } from './catalog-infinite-loader';

const trackCatalogEvent = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('@/lib/analytics', () => ({ trackCatalogEvent }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}));

const labels = {
  inStock: 'In stock',
  outOfStock: 'Out of stock',
  priceOnRequest: 'Ask',
  viewProduct: 'View',
  loadMore: 'Load more',
  loading: 'Loading',
  loadError: 'Try again',
  end: 'All products seen',
};
const query = {
  q: '',
  category: null,
  brand: null,
  discounted: false,
  minPrice: null,
  maxPrice: null,
  stock: 'all' as const,
  sort: 'newest' as const,
  page: 1,
};
const product = (id: number, title = `Tool ${id}`) => ({
  id,
  slug: `tool-${id}`,
  mongoId: null,
  title,
  titleAr: null,
  description: null,
  descriptionAr: null,
  sku: null,
  barcode: null,
  price: '4500.00',
  oldPrice: null,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 4,
  brandId: null,
  categoryId: null,
  images: [],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
});

describe('CatalogInfiniteLoader', () => {
  let intersectOnObserve = false;
  let intersectionCount = 1;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/fr/products');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
    trackCatalogEvent.mockClear();
    intersectOnObserve = false;
    intersectionCount = 1;
    vi.stubGlobal(
      'IntersectionObserver',
      class IntersectionObserverMock {
        callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        observe() {
          if (intersectOnObserve) {
            for (let count = 0; count < intersectionCount; count += 1) {
              this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
            }
          }
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the next page automatically and tracks the appended impression', async () => {
    intersectOnObserve = true;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [product(25, 'Cordless drill')],
          page: 2,
          hasNextPage: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        pageSize={6}
        listContext="similar_products"
        labels={labels}
      />,
    );

    await expect(
      screen.findByRole('heading', { name: 'Cordless drill' }),
    ).resolves.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/catalog?sort=newest&page=2&limit=6',
      expect.any(Object),
    );
    await waitFor(() =>
      expect(trackCatalogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'view_item_list',
          metadata: expect.objectContaining({
            page: 2,
            listContext: 'similar_products',
            visibleProductIds: [25],
          }),
        }),
      ),
    );
    expect(window.sessionStorage.getItem('bric:catalog-position:v2:/fr/products')).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('never restores global page position from an embedded similar-products list', async () => {
    window.history.replaceState({}, '', '/fr/products/current-drill');
    window.sessionStorage.setItem(
      'bric:catalog-position:v2:/fr/products/current-drill',
      JSON.stringify({
        items: [product(25, 'Previously loaded drill')],
        page: 2,
        hasNextPage: false,
        totalCount: 25,
        scrollY: 0,
      }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        listContext="similar_products"
        labels={labels}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Previously loaded drill' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(scrollTo).not.toHaveBeenCalled());
  });

  it('does not let a queued scroll save overwrite a newly appended page', async () => {
    intersectOnObserve = true;
    let resolveResponse: (response: Response) => void;
    let queuedScrollFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedScrollFrame ??= callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('scroll'));
    expect(queuedScrollFrame).not.toBeNull();
    resolveResponse!(
      new Response(JSON.stringify({ items: [product(25)], page: 2, hasNextPage: false }), {
        status: 200,
      }),
    );
    await expect(screen.findByRole('heading', { name: 'Tool 25' })).resolves.toBeInTheDocument();

    queuedScrollFrame!(0);

    expect(
      JSON.parse(window.sessionStorage.getItem('bric:catalog-position:v2:/fr/products') ?? 'null'),
    ).toMatchObject({ page: 2, hasNextPage: false });
  });

  it('deduplicates repeated observer notifications while a page is in flight', async () => {
    intersectOnObserve = true;
    intersectionCount = 2;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [product(25)],
          page: 2,
          hasNextPage: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(screen.findByRole('heading', { name: 'Tool 25' })).resolves.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reserves two product-card slots while the next page is loading', async () => {
    intersectOnObserve = true;
    let resolveResponse: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('.catalog-card-skeleton')).toHaveLength(2);
    resolveResponse!(
      new Response(JSON.stringify({ items: [product(25)], page: 2, hasNextPage: false }), {
        status: 200,
      }),
    );
    await expect(screen.findByRole('heading', { name: 'Tool 25' })).resolves.toBeInTheDocument();
    expect(document.querySelectorAll('.catalog-card-skeleton')).toHaveLength(0);
  });

  it('renders a product only once when an API page repeats its id', async () => {
    intersectOnObserve = true;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [product(25, 'Cordless drill'), product(25, 'Repeated drill')],
          page: 2,
          hasNextPage: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(
      screen.findByRole('heading', { name: 'Cordless drill' }),
    ).resolves.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Repeated drill' })).not.toBeInTheDocument();
  });

  it('caps persisted restoration data without truncating the live catalog', async () => {
    intersectOnObserve = true;
    const appendedProducts = Array.from({ length: 241 }, (_, index) => product(index + 25));
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: appendedProducts,
          page: 2,
          hasNextPage: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={265}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(screen.findByRole('heading', { name: 'Tool 265' })).resolves.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(241);
    expect(
      JSON.parse(window.sessionStorage.getItem('bric:catalog-position:v2:/fr/products') ?? 'null')
        .items,
    ).toHaveLength(240);
  });

  it('rebuilds appended pages before restoring the saved scroll offset', async () => {
    window.sessionStorage.setItem(
      'bric:catalog-position:v2:/fr/products',
      JSON.stringify({
        items: [product(25, 'Restored drill')],
        page: 2,
        hasNextPage: false,
        totalCount: 25,
        scrollY: 640,
      }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(
      screen.findByRole('heading', { name: 'Restored drill' }),
    ).resolves.toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' }));
    expect(screen.getByText('All products seen')).toBeInTheDocument();
  });

  it('deduplicates persisted products before restoring the catalog', async () => {
    window.sessionStorage.setItem(
      'bric:catalog-position:v2:/fr/products',
      JSON.stringify({
        items: [product(25, 'Restored drill'), product(25, 'Repeated restored drill')],
        page: 2,
        hasNextPage: false,
        totalCount: 25,
        scrollY: 640,
      }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={25}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(
      screen.findByRole('heading', { name: 'Restored drill' }),
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Repeated restored drill' }),
    ).not.toBeInTheDocument();
  });

  it('continues after the restored page instead of requesting it again', async () => {
    intersectOnObserve = true;
    window.sessionStorage.setItem(
      'bric:catalog-position:v2:/fr/products',
      JSON.stringify({
        items: [product(25, 'Restored drill')],
        page: 2,
        hasNextPage: true,
        totalCount: 26,
        scrollY: 640,
      }),
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [product(26, 'Next restored drill')],
          page: 3,
          hasNextPage: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={26}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    await expect(
      screen.findByRole('heading', { name: 'Next restored drill' }),
    ).resolves.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/catalog?sort=newest&page=3', expect.any(Object));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores restoration state from a different catalog total', async () => {
    window.sessionStorage.setItem(
      'bric:catalog-position:v2:/fr/products',
      JSON.stringify({
        items: [],
        page: 1,
        hasNextPage: false,
        totalCount: 24,
        scrollY: 900,
      }),
    );

    render(
      <CatalogInfiniteLoader
        locale="fr"
        query={query}
        initialCount={24}
        initialProductIds={Array.from({ length: 24 }, (_, index) => index + 1)}
        initialHasNextPage
        totalCount={48}
        brandNames={{}}
        categoryNames={{}}
        labels={labels}
      />,
    );

    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
