import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts } from '../lib/toast';
import { Toaster } from './ui/toaster';
import { AdCostsManager } from './ad-costs-manager';

vi.mock('./file-upload-field', () => ({
  FileUploadField: ({ label, onUploadStart, onUploaded }: { label: string; onUploadStart?: () => void; onUploaded?: () => void }) => (
    <button
      type="button"
      onClick={() => {
        onUploadStart?.();
        onUploaded?.();
      }}
    >
      {label}
    </button>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdCostsManager range="all" />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('AdCostsManager', () => {
  beforeEach(() => {
    clearToasts();
    vi.restoreAllMocks();
  });

  it('renders grouped ad costs and saves a new entry', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/stats/ad-costs?batches=true') {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                batchId: 'batch-1',
                fileName: 'ads.xlsx',
                importedAt: '2026-03-30T10:00:00.000Z',
                totalRows: 1,
                importedRows: 1,
                updatedRows: 0,
                currentRows: 1,
                currentSpend: 1200,
                dateRangeStart: '2026-03-30',
                dateRangeEnd: '2026-03-30',
              },
            ],
          }),
        };
      }

      if (url === '/api/stats/ad-costs' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ data: { id: 2, created: true } }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: '1',
              date: '2026-03-30',
              platform: 'facebook',
              campaignName: 'Prospecting',
              spend: 1200,
              impressions: 3000,
              clicks: 50,
              conversions: 4,
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderManager();

    expect(await screen.findByText('Prospecting')).toBeInTheDocument();
    expect(await screen.findByText('ads.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'actions.import' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'actions.add' }));
    await userEvent.type(screen.getByPlaceholderText('fields.spend'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats/ad-costs',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('deletes an imported ad spend spreadsheet batch', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/stats/ad-costs?batches=true') {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                batchId: 'batch-1',
                fileName: 'ads.xlsx',
                importedAt: '2026-03-30T10:00:00.000Z',
                totalRows: 1,
                importedRows: 1,
                updatedRows: 0,
                currentRows: 1,
                currentSpend: 1200,
                dateRangeStart: '2026-03-30',
                dateRangeEnd: '2026-03-30',
              },
            ],
          }),
        };
      }

      if (url === '/api/stats/ad-costs?batchId=batch-1' && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ data: { batchId: 'batch-1', deletedRows: 1 } }),
        };
      }

      return {
        ok: true,
        json: async () => ({ data: [] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderManager();

    expect(await screen.findByText('ads.xlsx')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'batches.delete' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stats/ad-costs?batchId=batch-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });
});
