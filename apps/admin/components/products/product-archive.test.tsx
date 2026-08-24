import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import { ProductArchive } from './product-archive';

const surfaceDetailsMock = vi.hoisted(() => vi.fn());
vi.mock('../admin-ai-surface-context', () => ({
  useAdminAiSurfaceDetails: surfaceDetailsMock,
}));

describe('ProductArchive', () => {
  it('uses document workspace chrome and links back to the Products family', () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProductArchive
          initialProducts={[
            {
              id: 18,
              title: 'Archived drill',
              sku: 'DRILL-18',
              barcode: null,
              archivedAt: '2026-08-20T10:00:00.000Z',
            },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Archived products' })).toHaveClass('text-xl');
    expect(screen.getByText('1')).toHaveClass('tabular-nums');
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/en/products');
    expect(surfaceDetailsMock).toHaveBeenCalledWith({
      filters: { state: 'archived', visibleCount: 1 },
      selection: null,
    });
  });
});
