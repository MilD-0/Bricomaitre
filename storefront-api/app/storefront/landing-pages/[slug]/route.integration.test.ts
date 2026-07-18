import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hasDb: vi.fn(), getDb: vi.fn(), read: vi.fn(), cache: vi.fn() }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: mocks.getDb }));
vi.mock('@bric/storefront-core/landing-page-records', () => ({ readPublishedStorefrontLandingPage: mocks.read }));
vi.mock('@bric/storefront-core/server-cache', () => ({ CACHE_TAGS: { landingPages: 'landing-pages', products: 'products' }, applyServerCache: mocks.cache }));

import { GET } from './route';

const page = {
  id: 4, slug: 'perceuse-20v', locale: 'fr', revision: 2, publishedAt: '2026-07-18T00:00:00.000Z',
  document: { schemaVersion: 1, theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' }, seo: { title: 'Perceuse 20V', description: 'Découvrez la perceuse 20V pour vos travaux.', indexable: false }, blocks: [
    { id: 'hero', type: 'product-hero', variant: 'media-left', heading: 'Perceuse 20V', subheading: 'Pour vos travaux.', imageUrl: null, imageAlt: '', primaryCtaLabel: 'Commander', showAddToCart: true },
    { id: 'final', type: 'final-cta', variant: 'solid', heading: 'Commandez maintenant', body: '', primaryCtaLabel: 'Commander', imageUrl: null, imageAlt: '' },
  ] },
  product: { id: 8, canonicalToken: 'perceuse-20v', title: 'Perceuse 20V', titleAr: null, description: null, descriptionAr: null, sku: null, barcode: null, price: '12000.00', oldPrice: null, availability: { status: 'in_stock', inStock: true, quantity: 3 }, media: [], brand: null, category: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z' },
};

describe('storefront landing page route', () => {
  beforeEach(() => { mocks.hasDb.mockReset().mockReturnValue(true); mocks.getDb.mockReset().mockReturnValue({ db: true }); mocks.read.mockReset().mockResolvedValue(page); mocks.cache.mockReset(); });
  it('returns only the validated published revision for the requested locale', async () => {
    const response = await GET(new NextRequest('http://localhost/storefront/landing-pages/perceuse-20v?locale=fr'), { params: Promise.resolve({ slug: 'perceuse-20v' }) });
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ db: true }, { slug: 'perceuse-20v', locale: 'fr' });
    expect(mocks.cache).toHaveBeenCalled();
  });
  it('rejects malformed lookups before querying the database', async () => {
    const response = await GET(new NextRequest('http://localhost/storefront/landing-pages/INVALID?locale=en'), { params: Promise.resolve({ slug: 'INVALID' }) });
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns a real not-found response for unpublished or missing pages', async () => {
    mocks.read.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/storefront/landing-pages/missing?locale=fr'), { params: Promise.resolve({ slug: 'missing' }) });
    expect(response.status).toBe(404);
  });
});
