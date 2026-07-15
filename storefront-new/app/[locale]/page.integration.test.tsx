import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockHomepageResponse } from '@/lib/homepage-mock';
import { generateMetadata, HomePageContent } from './page';

const mocks = vi.hoisted(() => ({ homepage: vi.fn() }));
vi.mock('@/lib/storefront-api', () => ({ getStorefrontHomepage: mocks.homepage }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => React.createElement('img', { ...props, priority: undefined, fetchPriority: undefined }) }));
vi.mock('@/components/page-shell', () => ({ PageShell: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }));
vi.mock('@/components/homepage-banner-carousel', () => ({ HomepageBannerCarousel: () => React.createElement('section', { 'data-home-section': 'banner' }) }));
vi.mock('@/components/homepage-carousels', () => ({
  HomepageProductCarousel: () => React.createElement('div', { 'data-carousel': 'products' }),
  HomepageCategoryCarousel: () => React.createElement('div', { 'data-home-section': 'categories' }),
  HomepageBrandCarousel: () => React.createElement('div', { 'data-home-section': 'brands' }),
}));
vi.mock('@/components/storefront-image', () => ({ StorefrontImage: (props: Record<string, unknown>) => React.createElement('img', props) }));

describe('homepage', () => {
  beforeEach(() => mocks.homepage.mockReset().mockResolvedValue(mockHomepageResponse));

  it('renders the agreed merchandising hierarchy from the homepage response', async () => {
    const html = renderToStaticMarkup(await HomePageContent({ params: Promise.resolve({ locale: 'fr' }) }));
    const order = ['data-home-section="banner"', 'Services', 'Top produits', 'Acheter par catégorie', 'Bien choisir pour mieux travailler', 'Nos marques', 'Pour équiper votre atelier'];
    let cursor = -1;
    for (const marker of order) { const next = html.indexOf(marker); expect(next).toBeGreaterThan(cursor); cursor = next; }
    expect(html).toContain('/fr/products/perceuse-sans-fil-20v');
  });

  it('renders localized Arabic section and editorial copy', async () => {
    const html = renderToStaticMarkup(await HomePageContent({ params: Promise.resolve({ locale: 'ar' }) }));
    expect(html).toContain('أفضل المنتجات');
    expect(html).toContain('بطارية واحدة لكل مشاريعك');
    expect(html).toContain('/ar/products/');
  });

  it('falls back to complete mock content when the homepage API is empty', async () => {
    mocks.homepage.mockResolvedValue({ banners: [], topProducts: [], categories: [], productCards: [], brands: [], featuredGroups: [] });
    const html = renderToStaticMarkup(await HomePageContent({ params: Promise.resolve({ locale: 'fr' }) }));
    expect(html).toContain('Top produits');
    expect(html).toContain('Une seule batterie, tous vos projets');
  });

  it('publishes indexable localized metadata for the selected homepage', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'fr' }) });
    expect(metadata.title).toContain('Les bons outils');
    expect(metadata.robots).toBeUndefined();
  });
});
