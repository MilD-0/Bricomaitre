import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { homepageFixtureResponse } from '@/test/fixtures/homepage';
import {
  HomepageBrandCarousel,
  HomepageCategoryCarousel,
  HomepageProductCarousel,
} from './homepage-carousels';

const mocks = vi.hoisted(() => ({
  autoScroll: vi.fn(() => ({ name: 'autoScroll' })),
  embla: vi.fn(() => [vi.fn(), null]),
}));
vi.mock('embla-carousel-auto-scroll', () => ({ default: mocks.autoScroll }));
vi.mock('embla-carousel-react', () => ({ default: mocks.embla }));
vi.mock('@/components/storefront-image', () => ({
  StorefrontImage: (props: Record<string, unknown>) => React.createElement('img', props),
}));

afterEach(() => vi.unstubAllGlobals());

const stamp = '2026-07-01T00:00:00.000Z';
const brands = [
  {
    id: 1,
    name: 'WADFOW',
    slug: 'wadfow',
    image: '/wadfow.png',
    featured: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 2,
    name: 'INGCO',
    slug: 'ingco',
    image: null,
    featured: false,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 3,
    name: 'TOTAL',
    slug: 'total',
    image: '/total.png',
    featured: false,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 4,
    name: 'TOLSEN',
    slug: 'tolsen',
    image: '/tolsen.png',
    featured: false,
    createdAt: stamp,
    updatedAt: stamp,
  },
];
const category = {
  id: 3,
  name: 'Éclairage',
  slug: null,
  nameEn: null,
  nameAr: null,
  image: null,
  parentId: null,
  properties: [],
  featured: false,
  productCount: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

describe('HomepageBrandCarousel', () => {
  it('bounds a large taxonomy while retaining featured brands and keyboard access', () => {
    const many = Array.from({ length: 1600 }, (_, index) => ({
      ...brands[0],
      id: index + 1,
      name: `Brand ${index}`,
      featured: index === 1599,
    }));
    const { container } = render(<HomepageBrandCarousel brands={many} locale="ar" />);
    expect(container.querySelectorAll('.home-brand-carousel a')).toHaveLength(24);
    expect(container.querySelector('a')).toHaveAttribute('aria-label', 'Brand 1599');
    expect(container.querySelectorAll('a:not([tabindex="-1"])')).toHaveLength(24);
  });
  it('uses Embla loop mode with uninterrupted auto-scroll', () => {
    const { container } = render(<HomepageBrandCarousel brands={brands} locale="fr" />);
    expect(mocks.embla).toHaveBeenCalledWith(
      expect.objectContaining({ loop: true, watchDrag: false }),
      [expect.objectContaining({ name: 'autoScroll' })],
    );
    expect(mocks.autoScroll).toHaveBeenCalledWith(
      expect.objectContaining({
        playOnInit: false,
        startDelay: 0,
        stopOnFocusIn: false,
        stopOnInteraction: false,
        stopOnMouseEnter: false,
      }),
    );
    expect(container.querySelectorAll('.home-brand-carousel a')).toHaveLength(24);
    expect(container.querySelectorAll('.home-brand-carousel a:not([tabindex="-1"])')).toHaveLength(
      brands.length,
    );
    expect(container.querySelectorAll('.home-brand-carousel a[aria-hidden="true"]')).toHaveLength(
      20,
    );
    expect(container.querySelector('.home-brand-name')).toHaveTextContent('INGCO');
    expect(container.querySelector('a[aria-label="WADFOW"]')).toHaveAttribute(
      'href',
      '/fr/brands/wadfow',
    );
  });

  it('keeps free-drag touch motion for category carousels', () => {
    const { container } = render(
      <HomepageCategoryCarousel categories={[{ ...category, slug: 'eclairage' }]} locale="fr" />,
    );

    expect(mocks.embla).toHaveBeenLastCalledWith(
      expect.objectContaining({
        align: 'start',
        dragFree: true,
        direction: 'ltr',
      }),
    );
    expect(container.querySelector('.home-category-carousel a')).toHaveAttribute(
      'href',
      '/fr/categories/eclairage',
    );
  });

  it('eagerly loads only the visible top-product row, not later featured groups', () => {
    const products = Array.from({ length: 5 }, (_, index) => ({
      ...homepageFixtureResponse.topProducts[0]!,
      id: index + 1,
    }));
    const { container, rerender } = render(
      <HomepageProductCarousel
        products={products}
        locale="fr"
        brands={homepageFixtureResponse.brands}
        categories={homepageFixtureResponse.categories}
        eagerImages
      />,
    );

    expect(container.querySelectorAll('img[loading="eager"]')).toHaveLength(4);
    expect(container.querySelectorAll('img[loading="lazy"]')).toHaveLength(1);

    rerender(
      <HomepageProductCarousel
        products={products}
        locale="fr"
        brands={homepageFixtureResponse.brands}
        categories={homepageFixtureResponse.categories}
        featuredGroupId={7}
      />,
    );
    expect(container.querySelectorAll('img[loading="eager"]')).toHaveLength(0);
    expect(container.querySelectorAll('img[loading="lazy"]')).toHaveLength(5);
  });

  it('shows product controls only when the carousel actually overflows', async () => {
    const product = homepageFixtureResponse.topProducts[0]!;
    const api = {
      rootNode: vi.fn(() => ({ clientWidth: 1200, scrollWidth: 1200 })),
      canScrollPrev: vi.fn(() => false),
      canScrollNext: vi.fn(() => true),
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    mocks.embla.mockReturnValueOnce([vi.fn(), api] as never);

    const { container, unmount } = render(
      <HomepageProductCarousel
        products={[product]}
        locale="fr"
        brands={homepageFixtureResponse.brands}
        categories={homepageFixtureResponse.categories}
      />,
    );

    await waitFor(() => expect(api.rootNode).toHaveBeenCalled());
    expect(container.querySelector('.home-carousel-controls')).not.toBeInTheDocument();
    unmount();

    api.rootNode.mockReturnValue({ clientWidth: 1200, scrollWidth: 1600 });
    mocks.embla.mockReturnValueOnce([vi.fn(), api] as never);
    const overflow = render(
      <HomepageProductCarousel
        products={[product]}
        locale="fr"
        brands={homepageFixtureResponse.brands}
        categories={homepageFixtureResponse.categories}
      />,
    );

    await waitFor(() =>
      expect(overflow.container.querySelector('.home-carousel-controls')).toBeInTheDocument(),
    );
  });
  it('cancels obsolete group requests and retries failed pages without replacing current cards', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const api = {
      rootNode: () => ({ clientWidth: 100, scrollWidth: 200 }),
      canScrollPrev: () => false,
      canScrollNext: () => true,
      selectedScrollSnap: () => 1,
      scrollSnapList: () => [0, 1],
      on: (event: string, callback: () => void) => {
        const set = listeners.get(event) ?? new Set();
        set.add(callback);
        listeners.set(event, set);
      },
      off: (event: string, callback: () => void) => listeners.get(event)?.delete(callback),
    };
    mocks.embla.mockReturnValue([vi.fn(), api] as never);
    const pending = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(
        Response.json({
          items: [
            { ...homepageFixtureResponse.topProducts[0]!, id: 93, title: 'New page product' },
          ],
          total: 2,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const initial = [homepageFixtureResponse.topProducts[0]!];
    const next = [{ ...initial[0]!, id: 92, title: 'Current selection' }];
    const props = {
      locale: 'fr' as const,
      brands: homepageFixtureResponse.brands,
      categories: homepageFixtureResponse.categories,
    };
    const { container, rerender } = render(
      <HomepageProductCarousel {...props} products={initial} featuredGroupId={1} />,
    );
    await act(async () => {
      listeners.get('select')?.forEach((callback) => callback());
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender(<HomepageProductCarousel {...props} products={next} featuredGroupId={2} />);
    expect((fetchMock.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true);
    await act(async () => {
      pending.resolve(
        Response.json({ items: [{ ...initial[0]!, id: 91, title: 'Obsolete product' }], total: 2 }),
      );
    });
    expect(container).not.toHaveTextContent('Obsolete product');
    expect(container).toHaveTextContent('Current selection');
    await act(async () => {
      listeners.get('select')?.forEach((callback) => callback());
    });
    expect(container).not.toHaveTextContent('Chargement…');
    await act(async () => {
      listeners.get('select')?.forEach((callback) => callback());
    });
    expect(container).toHaveTextContent('New page product');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/homepage/groups/1?page=2&limit=12',
      '/api/homepage/groups/2?page=2&limit=12',
      '/api/homepage/groups/2?page=2&limit=12',
    ]);
    mocks.embla.mockReturnValue([vi.fn(), null]);
  });
});
