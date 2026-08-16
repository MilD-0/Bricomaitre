import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BrandPageContent } from './page-content';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  catalog: vi.fn(
    (props: { heading: { title: string }; searchParams: Promise<Record<string, string>> }) =>
      React.createElement('main', null, props.heading.title),
  ),
  unavailable: vi.fn(({ locale }: { locale: string }) =>
    React.createElement('main', { 'data-locale': locale }, 'Unavailable'),
  ),
  capture: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/taxonomy-resolution', () => ({ resolveBrandSlug: mocks.resolve }));
vi.mock('@/app/[locale]/products/page-content', () => ({ CatalogPageContent: mocks.catalog }));
vi.mock('@/components/catalog-unavailable', () => ({ CatalogUnavailable: mocks.unavailable }));
vi.mock('@/lib/sentry', () => ({ captureCatalogPageException: mocks.capture }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, permanentRedirect: mocks.redirect }));

const brand = { id: 8, name: 'Wadfow', slug: 'wadfow' };

describe('brand landing route', () => {
  beforeEach(() => {
    mocks.resolve.mockReset().mockResolvedValue({ status: 'found', item: brand });
    mocks.catalog.mockClear();
    mocks.unavailable.mockClear();
    mocks.capture.mockClear();
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
  });

  it('renders brand-specific semantics with the canonical brand filter', async () => {
    const element = await BrandPageContent({
      params: Promise.resolve({ locale: 'fr', slug: 'wadfow' }),
      searchParams: Promise.resolve({ q: 'perceuse' }),
    });
    expect(renderToStaticMarkup(element)).toContain('Wadfow');
    expect(mocks.catalog.mock.calls[0][0]).toEqual(
      expect.objectContaining({ heading: expect.objectContaining({ title: 'Wadfow' }) }),
    );
    await expect(mocks.catalog.mock.calls[0][0].searchParams).resolves.toEqual({
      q: 'perceuse',
      brand: '8',
    });
  });

  it('does not convert a metadata outage into a missing brand', async () => {
    const error = new Error('metadata unavailable');
    mocks.resolve.mockResolvedValue({ status: 'unavailable', error });
    const element = await BrandPageContent({
      params: Promise.resolve({ locale: 'ar', slug: 'wadfow' }),
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(element)).toContain('Unavailable');
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(error, {
      locale: 'ar',
      operation: 'brand-resolution',
    });
  });
});
