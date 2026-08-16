import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogTelemetry } from './catalog-telemetry';

const trackCatalogEvent = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('@/lib/analytics', () => ({ trackCatalogEvent }));

describe('CatalogTelemetry', () => {
  beforeEach(() => trackCatalogEvent.mockClear());
  afterEach(() => cleanup());

  it('tracks governed impressions, discovery controls, and delegated product selection', async () => {
    const view = render(
      <>
        <CatalogTelemetry
          locale="fr"
          query={{
            q: 'perceuse',
            category: 3,
            brand: 2,
            discounted: true,
            sort: 'price-asc',
            page: 2,
          }}
          resultsCount={1}
          visibleProductIds={[12]}
        />
        <a
          href="#product"
          data-catalog-product
          data-product-id="12"
          data-product-slug="desk-lamp"
          data-category-id="3"
          data-brand-id="2"
          data-position="1"
        >
          Desk lamp
        </a>
      </>,
    );

    await waitFor(() =>
      expect(trackCatalogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'view_item_list',
          metadata: expect.objectContaining({ visibleProductIds: [12] }),
        }),
      ),
    );
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'search', searchTerm: 'perceuse' }),
    );
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'filter_apply', categoryId: 3 }),
    );
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'filter_apply', brandId: 2 }),
    );
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'filter_apply',
        metadata: expect.objectContaining({ filterKind: 'discounted' }),
      }),
    );
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'sort_change' }),
    );

    fireEvent.click(view.getByRole('link', { name: 'Desk lamp' }));
    expect(trackCatalogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'select_item',
        productId: 12,
        productSlug: 'desk-lamp',
        metadata: expect.objectContaining({ position: 1, page: 2 }),
      }),
    );
  });

  it('does not report the canonical recommended order as a user sort change', async () => {
    render(
      <CatalogTelemetry
        locale="fr"
        query={{
          q: '',
          category: null,
          brand: null,
          discounted: false,
          sort: 'recommended',
          page: 1,
        }}
        resultsCount={12}
        visibleProductIds={[12]}
      />,
    );

    await waitFor(() =>
      expect(trackCatalogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'view_item_list',
        }),
      ),
    );
    expect(trackCatalogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'sort_change' }),
    );
  });
});
