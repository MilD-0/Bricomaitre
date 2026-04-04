import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionHistoryPanel } from './action-history-panel';
import { server } from '../test/mocks/server';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'history.itemsCount') {
      return `${values?.count ?? 0} entries`;
    }

    if (key === 'history.resultsSummary') {
      return `Showing ${values?.count ?? 0} of ${values?.total ?? 0} entries`;
    }

    if (key === 'history.details.title') {
      return `${values?.entity ?? ''} activity`;
    }

    if (key === 'history.details.changesCount') {
      return `${values?.count ?? 0} changes`;
    }

    if (key === 'history.resourceContext') {
      return `${values?.entity ?? ''} records`;
    }

    if (key === 'history.notifications.undo.loading') {
      return `undo:${values?.entity ?? ''}:loading`;
    }

    if (key === 'history.notifications.undo.success') {
      return `undo:${values?.entity ?? ''}:success`;
    }

    if (key === 'history.notifications.redo.loading') {
      return `redo:${values?.entity ?? ''}:loading`;
    }

    if (key === 'history.notifications.redo.success') {
      return `redo:${values?.entity ?? ''}:success`;
    }

    if (key === 'history.changeLine') {
      return `${values?.field}: ${values?.before} -> ${values?.after}`;
    }

    return key;
  },
}));

vi.mock('../lib/toast', () => ({
  toast: toastMock,
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ActionHistoryPanel />
    </QueryClientProvider>,
  );
}

function buildHistoryResponse(requestUrl: string, items: Array<Record<string, unknown>>) {
  const url = new URL(requestUrl);
  const page = Number(url.searchParams.get('page') ?? '1');
  const limit = Number(url.searchParams.get('limit') ?? '10');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  const operation = url.searchParams.get('operation') ?? 'all';
  const resource = url.searchParams.get('resource') ?? 'all';
  const state = url.searchParams.get('state') ?? 'all';
  const sortKey = (url.searchParams.get('sortKey') ?? 'createdAt') as 'operation' | 'resource' | 'createdBy' | 'createdAt' | 'isUndone';
  const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc';

  const filtered = items
    .filter((item) => {
      if (search.length === 0) {
        return true;
      }

      return [
        item.entityLabel,
        item.entityType,
        item.resource,
        item.operation,
        item.createdBy,
        item.createdByName,
      ].some((value) => String(value ?? '').toLowerCase().includes(search));
    })
    .filter((item) => operation === 'all' || item.operation === operation)
    .filter((item) => resource === 'all' || item.resource === resource)
    .filter((item) => state === 'all' || (state === 'undone' ? item.isUndone === true : item.isUndone === false));

  const sorted = [...filtered].sort((left, right) => {
    const factor = sortDirection === 'asc' ? 1 : -1;

    if (sortKey === 'operation') {
      return String(left.operation).localeCompare(String(right.operation)) * factor;
    }

    if (sortKey === 'resource') {
      return String(left.resource).localeCompare(String(right.resource)) * factor;
    }

    if (sortKey === 'createdBy') {
      const leftActor = String(left.createdByName ?? left.createdBy ?? '');
      const rightActor = String(right.createdByName ?? right.createdBy ?? '');
      return leftActor.localeCompare(rightActor) * factor;
    }

    if (sortKey === 'isUndone') {
      return (Number(left.isUndone) - Number(right.isUndone)) * factor;
    }

    return (new Date(String(left.createdAt)).getTime() - new Date(String(right.createdAt)).getTime()) * factor;
  });

  const start = (page - 1) * limit;

  return {
    items: sorted.slice(start, start + limit),
    pagination: {
      page,
      limit,
      totalItems: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
      hasNextPage: start + limit < sorted.length,
      hasPreviousPage: page > 1,
    },
  };
}

describe('ActionHistoryPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a sortable, filterable, paginated history table with details', async () => {
    const items = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      resource: index === 9 ? 'stats' : index === 10 ? 'orders' : 'products',
      entityType: index === 9 ? 'statsAdCosts' : index === 10 ? 'orders' : 'products',
      entityId: index + 101,
      entityLabel: index === 9 ? 'Reverted dashboard' : index === 10 ? 'Paged order' : `History item ${index + 1}`,
      operation: index === 9 ? 'update' : index === 10 ? 'delete' : 'create',
      createdBy: index === 9 ? 'nadia@example.com' : `user${index + 1}@example.com`,
      createdByName: index === 9 ? 'Nadia' : `User ${index + 1}`,
      isUndone: index === 9,
      changes: index === 9 ? [{ field: 'Spend', before: 200, after: 150 }] : [],
      createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      undoneAt: index === 9 ? '2026-03-10T01:00:00.000Z' : null,
      redoneAt: null,
    }));

    server.use(
      http.get('/api/action-history', ({ request }) => HttpResponse.json(buildHistoryResponse(request.url, items))),
    );

    renderPanel();

    expect(await screen.findByText('Paged order')).toBeInTheDocument();
    expect(screen.queryByText('History item 1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'actions.next' }));

    expect(await screen.findByText('History item 1')).toBeInTheDocument();
    expect(screen.queryByText('History item 11')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'actions.first' }));
    expect(await screen.findByText('Paged order')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'history.columns.actions' }));

    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      expect(within(rows[1]!).getByText('Reverted dashboard')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('history.searchPlaceholder'), 'Nadia');
    expect(await screen.findByText('Reverted dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Paged order')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'history.viewDetails' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Reverted dashboard activity')).toBeInTheDocument();
    expect(screen.getByText('Spend')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('allows undo and redo transitions with toast feedback', async () => {
    type HistoryItem = {
      id: number;
      resource: string;
      entityType: string;
      entityId: number;
      entityLabel: string;
      operation: 'create' | 'update' | 'delete';
      createdBy: string | null;
      createdByName: string | null;
      isUndone: boolean;
      changes: Array<{ field: string; before: unknown; after: unknown }>;
      createdAt: string;
      undoneAt: string | null;
      redoneAt: string | null;
    };

    const items: HistoryItem[] = [
      {
        id: 1,
        resource: 'products',
        entityType: 'products',
        entityId: 9,
        entityLabel: 'Widget',
        operation: 'update',
        createdBy: 'admin@example.com',
        createdByName: 'Admin',
        isUndone: false,
        changes: [{ field: 'In Stock', before: false, after: true }],
        createdAt: '2026-03-21T00:00:00.000Z',
        undoneAt: null,
        redoneAt: null,
      },
    ];

    server.use(
      http.get('/api/action-history', ({ request }) => HttpResponse.json(buildHistoryResponse(request.url, items))),
      http.post('/api/action-history/:id/undo', ({ params }) => {
        items[0] = { ...items[0], id: Number(params.id), isUndone: true, undoneAt: '2026-03-21T00:01:00.000Z' };
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/action-history/:id/redo', ({ params }) => {
        items[0] = { ...items[0], id: Number(params.id), isUndone: false, redoneAt: '2026-03-21T00:02:00.000Z' };
        return HttpResponse.json({ ok: true });
      }),
    );

    renderPanel();

    expect(await screen.findByText('Widget')).toBeInTheDocument();
    const undoButton = screen.getByRole('button', { name: 'history.undo' });
    const redoButton = screen.getByRole('button', { name: 'history.redo' });

    expect(undoButton).toBeEnabled();
    expect(redoButton).toBeDisabled();

    await userEvent.click(undoButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'history.undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'history.redo' })).toBeEnabled();
    });

    expect(toastMock.loading).toHaveBeenCalledWith('undo:Widget:loading');
    expect(toastMock.success).toHaveBeenCalledWith('undo:Widget:success', { id: 'toast-id' });

    await userEvent.click(screen.getByRole('button', { name: 'history.redo' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'history.undo' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'history.redo' })).toBeDisabled();
    });

    expect(toastMock.loading).toHaveBeenCalledWith('redo:Widget:loading');
    expect(toastMock.success).toHaveBeenCalledWith('redo:Widget:success', { id: 'toast-id' });
  });
});
