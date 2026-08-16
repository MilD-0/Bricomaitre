import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts } from '../../lib/toast';
import { Toaster } from '../ui/toaster';
import { ManualOrderHistory } from './manual-order-history';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) {
      return `${key}:${Object.values(values).join('|')}`;
    }

    return key;
  },
}));

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ManualOrderHistory />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('ManualOrderHistory', () => {
  beforeEach(() => {
    clearToasts();
    vi.restoreAllMocks();
  });

  it('renders manual orders and deletes one', async () => {
    const orders = Array.from({ length: 11 }, (_, index) => ({
      id: String(index + 1),
      tracking: `MANUAL-${index + 1}`,
      customerName: 'Ada',
      wilaya: 'Alger',
      amountCollected: 1200,
      netRevenue: 1000,
      profit: 400,
      createdAt: '2026-03-30T00:00:00.000Z',
      products: [{ title: 'Drill', quantity: 1 }],
    }));
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith('/api/stats/manual-order?page=')) {
        const url = new URL(input, 'http://localhost');
        const page = Number(url.searchParams.get('page') ?? '1');
        const limit = Number(url.searchParams.get('limit') ?? '10');
        const start = (page - 1) * limit;
        return {
          ok: true,
          json: async () => ({
            data: orders.slice(start, start + limit),
            pagination: {
              page,
              limit,
              totalItems: orders.length,
              totalPages: Math.max(1, Math.ceil(orders.length / limit)),
              hasNextPage: start + limit < orders.length,
              hasPreviousPage: page > 1,
            },
          }),
        };
      }

      if (init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ data: { id: 1 } }),
        };
      }

      throw new Error(`Unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHistory();

    expect(await screen.findByText('MANUAL-1')).toBeInTheDocument();
    expect(screen.queryByText('MANUAL-11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'labels.goToPage:2' }));
    expect(await screen.findByText('MANUAL-11')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'history.delete' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stats/manual-order/11', { method: 'DELETE' });
    });
  });

  it('shows a loading skeleton before manual orders resolve', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            return undefined;
          }),
      ),
    );

    const { container } = renderHistory();

    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
