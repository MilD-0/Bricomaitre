import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EcotrackRecovery } from './ecotrack-recovery';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

describe('carrier recovery', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('resolves a manually created shipment without requesting or sending evidence text', async () => {
    const user = userEvent.setup();
    const requests: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({ ok: true });
      }
      return Response.json({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            orderId: 101,
            kind: 'post',
            provider: 'delivro',
            trackingNumber: null,
            state: 'uncertain',
            error: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            canResolve: true,
            customer: 'Ahmed Benali',
            amount: 1800,
            destination: 'Alger',
            phone: '0550000011',
            content: null,
            products: 'Perceuse x1',
          },
        ],
      });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EcotrackRecovery />
      </QueryClientProvider>,
    );

    const section = await screen.findByRole('region', {
      name: 'ordersEcotrackManager.recovery.title',
    });
    expect(
      screen.queryByText('ordersEcotrackManager.recovery.description'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ordersEcotrackManager.recovery.review' }));
    expect(section.querySelector('textarea')).toBeNull();
    expect(screen.queryByText('ordersEcotrackManager.recovery.verify')).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.recovery.tracking'),
      'RECOVERED-101',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.recovery.confirmApplied' }),
    );

    await waitFor(() =>
      expect(requests).toEqual([
        {
          operationId: '00000000-0000-4000-8000-000000000001',
          action: 'confirm_applied',
          trackingNumber: 'RECOVERED-101',
        },
      ]),
    );
  });
});
