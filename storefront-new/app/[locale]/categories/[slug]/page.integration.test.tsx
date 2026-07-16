import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryPageContent, generateMetadata } from './page';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  catalog: vi.fn((props: { heading: { title: string }; searchParams: Promise<Record<string, string>> }) => React.createElement('main', null, props.heading.title)),
  unavailable: vi.fn(({ locale }: { locale: string }) => React.createElement('main', { 'data-locale': locale }, 'Unavailable')),
  capture: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));

vi.mock('@/lib/taxonomy-resolution', () => ({ resolveCategorySlug: mocks.resolve }));
vi.mock('@/app/[locale]/products/page', () => ({ CatalogPageContent: mocks.catalog }));
vi.mock('@/components/catalog-unavailable', () => ({ CatalogUnavailable: mocks.unavailable }));
vi.mock('@/lib/sentry', () => ({ captureCatalogPageException: mocks.capture }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, permanentRedirect: mocks.redirect }));

const category = { id: 4, name: 'Éclairage', nameAr: 'الإضاءة', slug: 'eclairage' };

describe('category landing route', () => {
  beforeEach(() => {
    mocks.resolve.mockReset().mockResolvedValue({ status: 'found', item: category });
    mocks.catalog.mockClear();
    mocks.unavailable.mockClear();
    mocks.capture.mockClear();
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
  });

  it('renders category-specific semantics and preserves discovery parameters', async () => {
    const element = await CategoryPageContent({
      params: Promise.resolve({ locale: 'fr', slug: 'eclairage' }),
      searchParams: Promise.resolve({ sort: 'price-asc' }),
    });
    expect(renderToStaticMarkup(element)).toContain('Éclairage');
    expect(mocks.catalog.mock.calls[0][0]).toEqual(expect.objectContaining({
      heading: expect.objectContaining({ title: 'Éclairage' }),
      searchParams: expect.any(Promise),
    }));
    await expect(mocks.catalog.mock.calls[0][0].searchParams).resolves.toEqual({ sort: 'price-asc', category: '4' });
    await expect(generateMetadata({
      params: Promise.resolve({ locale: 'fr', slug: 'eclairage' }),
      searchParams: Promise.resolve({ sort: 'price-asc' }),
    })).resolves.toMatchObject({
      alternates: { canonical: 'https://bricomaitre.com/fr/categories/eclairage' },
      robots: { index: false, follow: true },
    });
  });

  it('renders a recoverable unavailable state instead of returning 404 on an upstream outage', async () => {
    const error = new Error('metadata unavailable');
    mocks.resolve.mockResolvedValue({ status: 'unavailable', error });
    const element = await CategoryPageContent({
      params: Promise.resolve({ locale: 'fr', slug: 'eclairage' }),
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(element)).toContain('Unavailable');
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(error, { locale: 'fr', operation: 'category-resolution' });
    await expect(generateMetadata({
      params: Promise.resolve({ locale: 'fr', slug: 'eclairage' }),
      searchParams: Promise.resolve({}),
    })).resolves.toMatchObject({ robots: { index: false, follow: true } });
  });

  it('404s genuinely missing entries', async () => {
    mocks.resolve.mockResolvedValueOnce({ status: 'missing' });
    await expect(CategoryPageContent({
      params: Promise.resolve({ locale: 'fr', slug: 'missing' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
