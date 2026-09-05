import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import { ProductArchive } from './product-archive';

const { surfaceDetailsMock, pushMock, refreshMock } = vi.hoisted(() => ({
  surfaceDetailsMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock('../admin-ai-surface-context', () => ({
  useAdminAiSurfaceDetails: surfaceDetailsMock,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

describe('ProductArchive', () => {
  it('uses document workspace chrome and links back to the Products family', () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProductArchive
          initialData={{
            items: [
              {
                id: 18,
                title: 'Archived drill',
                sku: 'DRILL-18',
                barcode: null,
                archivedAt: '2026-08-20T10:00:00.000Z',
              },
            ],
            pagination: {
              page: 1,
              limit: 50,
              totalItems: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Archived products' })).toHaveClass('text-xl');
    expect(screen.getByText('1')).toHaveClass('tabular-nums');
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/en/products');
    expect(surfaceDetailsMock).toHaveBeenCalledWith({
      filters: { state: 'archived', page: 1, visibleCount: 1, totalItems: 1 },
      selection: null,
    });
  });
});
