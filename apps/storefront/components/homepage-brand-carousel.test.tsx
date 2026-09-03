import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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
});
