import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/mocks/server';
import { ActionHistoryPanel } from './action-history-panel';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, string | number>) => {
      if (key === 'history.itemsCount') return `${values?.count ?? 0} entries`;
      if (key === 'history.details.changesCount') return `${values?.count ?? 0} changes`;
      if (key === 'history.summaries.fields') return `Updated ${values?.fields}`;
      if (key === 'history.summaries.fieldsAndMore')
        return `Updated ${values?.fields} and ${values?.count} more`;
      if (key === 'labels.goToPage') return `go to ${values?.page}`;
      if (key.startsWith('history.notifications.')) return `${key}:${values?.entity ?? ''}`;
      return key;
    };
    translate.has = (key: string) =>
      [
        'history.summaryGroups.confirmation',
        'history.summaryGroups.shipment',
        'history.fields.note',
      ].includes(key);
    return translate;
  },
}));

vi.mock('../lib/toast', () => ({ toast: toastMock }));

const firstItem = {
  id: 12,
  resource: 'orders',
  entityType: 'orders',
  entityId: 16372,
  entityLabel: 'Bahi Youcef',
  operation: 'update' as const,
  createdBy: 'owner@example.com',
  createdByName: 'Owner',
  isReversible: true,
  isUndone: false,
  changeCount: 4,
  changePreview: [{ key: 'confirmation', kind: 'group' as const, field: 'Confirmation' }],
  semanticChangeCount: 1,
  createdAt: '2026-08-19T10:00:00.000Z',
};

function listResponse(items = [firstItem], page = 1, totalPages = 1) {
  return {
    items,
    pagination: {
      page,
      limit: 20,
      totalItems: items.length + (totalPages - 1) * 20,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

function detailResponse(
  item = firstItem,
  recovery: { nextAction: 'undo' | 'redo' | null; blockedReason: string | null } = {
    nextAction: 'undo',
    blockedReason: null,
  },
) {
  return {
    item: {
      ...item,
      changes: [
        { key: 'confirmed', field: 'Confirmed', before: 0, after: 2 },
        { key: 'note', field: 'Note', before: null, after: 'Call first' },
      ],
      undoneAt: null,
      redoneAt: null,
    },
    recovery,
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ActionHistoryPanel />
    </QueryClientProvider>,
  );
}

describe('ActionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });
  afterEach(cleanup);

  it('renders a concise day-grouped activity list and persistent inspector', async () => {
    server.use(
      http.get('/api/action-history', () => HttpResponse.json(listResponse())),
      http.get('/api/action-history/12', () => HttpResponse.json(detailResponse())),
    );
    renderPanel();

    expect(await screen.findByRole('button', { name: /Bahi Youcef/ })).toBeInTheDocument();
    expect(screen.getByText('Updated history.summaryGroups.confirmation')).toBeInTheDocument();
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Call first')).toBeInTheDocument();
    expect(screen.queryByText('history.state.applied')).not.toBeInTheDocument();
  });

  it('keeps automatic syncs behind the compact filter control', async () => {
    const requests: string[] = [];
    server.use(
      http.get('/api/action-history', ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json(listResponse());
      }),
      http.get('/api/action-history/12', () => HttpResponse.json(detailResponse())),
    );
    const view = renderPanel();
    await screen.findByText('Bahi Youcef');
    expect(view.container.querySelector('[data-mobile-history-controls]')).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto_auto]',
    );
    expect(view.container.querySelector('[data-mobile-history-list]')).toHaveClass(
      'min-h-0',
      'xl:min-h-[38rem]',
    );
    await userEvent.click(screen.getByRole('button', { name: /history.filters.title/ }));
    await userEvent.click(
      screen.getByRole('switch', { name: 'history.filters.includeEcotrackSyncLabel' }),
    );

    await waitFor(() =>
      expect(requests.some((url) => url.includes('includeEcotrackSync=true'))).toBe(true),
    );
  });

  it('confirms and executes only the recovery action supplied by the inspector contract', async () => {
    const undo = vi.fn(() => HttpResponse.json({ ok: true }));
    server.use(
      http.get('/api/action-history', () => HttpResponse.json(listResponse())),
      http.get('/api/action-history/12', () => HttpResponse.json(detailResponse())),
      http.post('/api/action-history/12/undo', undo),
    );
    renderPanel();
    await screen.findByText('Confirmed');
    await userEvent.click(screen.getByRole('button', { name: 'history.undo' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('history.recovery.confirm.undoTitle')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'history.undo' }));

    await waitFor(() => expect(undo).toHaveBeenCalledOnce());
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('explains unavailable recovery without rendering misleading actions', async () => {
    server.use(
      http.get('/api/action-history', () => HttpResponse.json(listResponse())),
      http.get('/api/action-history/12', () =>
        HttpResponse.json(
          detailResponse(firstItem, { nextAction: null, blockedReason: 'newer_action' }),
        ),
      ),
    );
    renderPanel();

    expect(await screen.findByText('history.recovery.blocked.newer_action')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'history.undo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'history.redo' })).not.toBeInTheDocument();
  });

  it('uses a focus-restoring detail sheet below the wide workspace breakpoint', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    server.use(
      http.get('/api/action-history', () => HttpResponse.json(listResponse())),
      http.get('/api/action-history/12', () => HttpResponse.json(detailResponse())),
    );
    renderPanel();

    const row = await screen.findByRole('button', { name: /Bahi Youcef/ });
    await userEvent.click(row);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Bahi Youcef')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'actions.close' }));
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('uses strong numbered pagination and requests the selected page', async () => {
    const pages: string[] = [];
    server.use(
      http.get('/api/action-history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        pages.push(page);
        return HttpResponse.json(listResponse([firstItem], Number(page), 3));
      }),
      http.get('/api/action-history/12', () => HttpResponse.json(detailResponse())),
    );
    renderPanel();
    await screen.findByText('Bahi Youcef');
    await userEvent.click(screen.getByRole('button', { name: 'go to 2' }));
    await waitFor(() => expect(pages).toContain('2'));
  });
});
