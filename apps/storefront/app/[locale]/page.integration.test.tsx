import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { homepageFixtureResponse } from '@/test/fixtures/homepage';
import { generateMetadata } from './page';
import { HomePageContent } from './page-content';

const mocks = vi.hoisted(() => ({ homepage: vi.fn(), settings: vi.fn() }));
vi.mock('@/lib/storefront-api', () => ({
  getStorefrontHomepage: mocks.homepage,
  getStorefrontSettings: mocks.settings,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': 'test-nonce' }),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { ...props, priority: undefined, fetchPriority: undefined }),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('main', null, children),
}));
vi.mock('@/components/homepage-banner-carousel', () => ({
  HomepageBannerCarousel: () => React.createElement('section', { 'data-home-section': 'banner' }),
}));
vi.mock('@/components/homepage-carousels', () => ({
  HomepageProductCarousel: () => React.createElement('div', { 'data-carousel': 'products' }),
  HomepageCategoryCarousel: () => React.createElement('div', { 'data-home-section': 'categories' }),
  HomepageBrandCarousel: () => React.createElement('div', { 'data-home-section': 'brands' }),
}));
vi.mock('@/components/storefront-image', () => ({
  StorefrontImage: (props: Record<string, unknown>) => React.createElement('img', props),
}));

describe('homepage', () => {
  beforeEach(() => {
    mocks.homepage.mockReset().mockResolvedValue(homepageFixtureResponse);
    mocks.settings.mockReset().mockResolvedValue({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
  });

  it('renders the agreed merchandising hierarchy from the homepage response', async () => {
    const html = renderToStaticMarkup(
      await HomePageContent({ params: Promise.resolve({ locale: 'fr' }) }),
    );
    const order = [
      'data-home-section="banner"',
      'Services',
      'Top produits',
      'Acheter par catégorie',
      'Bien choisir pour mieux travailler',
      'Nos marques',
      'Pour équiper votre atelier',
    ];
    let cursor = -1;
    for (const marker of order) {
      const next = html.indexOf(marker);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(html).toContain('/fr/products/perceuse-sans-fil-20v');
    expect(html).toContain('home-featured-heading');
    expect(html).toContain('home-featured-cta');
    expect(html).toContain('href="/fr/products"');
  });

  it('renders localized Arabic section and editorial copy', async () => {
    const html = renderToStaticMarkup(
      await HomePageContent({ params: Promise.resolve({ locale: 'ar' }) }),
    );
    expect(html).toContain('أفضل المنتجات');
    expect(html).toContain('بطارية واحدة لكل مشاريعك');
    expect(html).toContain('/ar/products/');
  });

  it('renders a controlled empty state instead of leaking mock merchandise', async () => {
    mocks.homepage.mockResolvedValue({
      banners: [],
      topProducts: [],
      categories: [],
      productCards: [],
      brands: [],
      featuredGroups: [],
    });
    const html = renderToStaticMarkup(
      await HomePageContent({ params: Promise.resolve({ locale: 'fr' }) }),
    );
    expect(html).toContain('Nos produits sont momentanément indisponibles');
    expect(html).not.toContain('Une seule batterie, tous vos projets');
  });

  it('publishes indexable localized metadata and homepage structured data', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'fr' }) });
    expect(metadata).toMatchObject({
      alternates: { canonical: 'https://bricomaitre.com/fr' },
      robots: { index: true, follow: true },
    });
    const html = renderToStaticMarkup(
      await HomePageContent({ params: Promise.resolve({ locale: 'fr' }) }),
    );
    expect(html).toContain('application/ld+json');
    expect(html).toContain('https://schema.org');
  });

  it('loads homepage content and settings concurrently and passes the shared snapshot to the shell', async () => {
    let releaseHomepage!: () => void;
    let releaseSettings!: () => void;
    mocks.homepage.mockReturnValue(
      new Promise((resolve) => {
        releaseHomepage = () => resolve(homepageFixtureResponse);
      }),
    );
    mocks.settings.mockReturnValue(
      new Promise((resolve) => {
        releaseSettings = () =>
          resolve({
            phoneDisplay: '0795 34 28 26',
            phoneHref: 'tel:+213795342826',
            phoneEnabled: true,
            aiAssistantEnabled: false,
          });
      }),
    );

    const rendering = HomePageContent({ params: Promise.resolve({ locale: 'fr' }) });
    await vi.waitFor(() => {
      expect(mocks.homepage).toHaveBeenCalledOnce();
      expect(mocks.settings).toHaveBeenCalledOnce();
    });
    releaseHomepage();
    releaseSettings();
    await expect(rendering).resolves.toBeTruthy();
  });
});
