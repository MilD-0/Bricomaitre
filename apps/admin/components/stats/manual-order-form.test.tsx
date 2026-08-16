import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts } from '../../lib/toast';
import { Toaster } from '../ui/toaster';
import { ManualOrderForm } from './manual-order-form';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ManualOrderForm open onOpenChange={vi.fn()} />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('ManualOrderForm', () => {
  beforeEach(() => {
    clearToasts();
    vi.restoreAllMocks();
  });

  it('creates a manual order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 1, tracking: 'MANUAL-1' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderForm();

    await userEvent.type(screen.getByPlaceholderText('fields.tracking'), 'MANUAL-1');
    await userEvent.type(screen.getByPlaceholderText('fields.amountCollected'), '1500');
    await userEvent.click(screen.getByRole('button', { name: 'actions.create' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats/manual-order',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
