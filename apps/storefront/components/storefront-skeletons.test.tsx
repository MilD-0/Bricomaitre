import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CatalogPageSkeleton,
  CheckoutPageSkeleton,
  HomePageSkeleton,
  ProductPageSkeleton,
  SearchResultsSkeleton,
  SimilarProductsSkeleton,
  ThankYouPageSkeleton,
} from './storefront-skeletons';

describe('storefront skeletons', () => {
  it.each([
    ['home', HomePageSkeleton],
    ['catalog', CatalogPageSkeleton],
    ['product', ProductPageSkeleton],
    ['checkout', CheckoutPageSkeleton],
    ['thank-you', ThankYouPageSkeleton],
  ])('reserves an accessible shell for the %s route', (page, Component) => {
    const html = renderToStaticMarkup(<Component />);
    expect(html).toContain(`data-skeleton-page="${page}"`);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('storefront-skeleton');
  });

  it('uses catalog-card placeholders for streamed product collections', () => {
    expect(renderToStaticMarkup(<SimilarProductsSkeleton />)).toContain('catalog-card-skeleton');
    expect(renderToStaticMarkup(<SearchResultsSkeleton />)).toContain('global-search-skeleton');
  });

  it('reserves the complete catalog layout instead of a partial product column', () => {
    const html = renderToStaticMarkup(<CatalogPageSkeleton />);

    expect(html).toContain('catalog-skeleton-layout');
    expect(html.match(/<article class="catalog-card catalog-card-skeleton"/g)).toHaveLength(8);
  });
});
