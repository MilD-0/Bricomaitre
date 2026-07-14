import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { SimilarProductsTelemetry } from './similar-products-telemetry';

const track = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('@/lib/analytics', () => ({ trackCatalogEvent: track }));

afterEach(() => {
  cleanup();
  track.mockClear();
});

it('tracks related-product impressions and selections with their list context', async () => {
  render(
    <section data-similar-products>
      <SimilarProductsTelemetry locale="fr" productIds={[13]} />
      <a href="#drill" data-catalog-product data-product-id="13" data-product-slug="drill" data-position="1">Drill</a>
    </section>,
  );
  await waitFor(() => expect(track).toHaveBeenCalledWith(expect.objectContaining({
    eventName: 'view_item_list',
    metadata: expect.objectContaining({ listContext: 'similar_products', visibleProductIds: [13] }),
  })));
  fireEvent.click(screen.getByRole('link', { name: 'Drill' }));
  expect(track).toHaveBeenCalledWith(expect.objectContaining({
    eventName: 'select_item',
    productId: 13,
    metadata: expect.objectContaining({ listContext: 'similar_products' }),
  }));
});
