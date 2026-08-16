import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserAccessPanel } from './user-access-panel';
import { server } from '../../test/mocks/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === 'settings.accessManager.count') {
      return `${values?.count ?? '0'} allowed emails`;
    }

    if (key.startsWith('roles.')) {
      return key;
    }

    return key;
  },
}));

vi.mock('../../lib/toast', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserAccessPanel />
    </QueryClientProvider>,
  );
}

describe('UserAccessPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('creates and edits an access grant', async () => {
    const items = [
      {
        id: 1,
        email: 'viewer@example.com',
        role: 'viewer',
        roleDefinitionId: null,
        roleLabel: null,
        createdAt: '2026-03-31T00:00:00.000Z',
        updatedAt: '2026-03-31T00:00:00.000Z',
      },
    ];

    server.use(
      http.get('/api/settings/access', () =>
        HttpResponse.json({
          items,
          availableBuiltInRoles: ['viewer', 'employee'],
          availableCustomRoles: [{ id: 7, name: 'Campaign Manager' }],
        }),
      ),
      http.post('/api/settings/access', async ({ request }) => {
        const body = (await request.json()) as {
          email: string;
          role: string | null;
          roleDefinitionId: number | null;
        };
        items.push({
          id: 2,
          email: body.email,
          role: body.role ?? 'viewer',
          roleDefinitionId: body.roleDefinitionId,
          roleLabel: body.roleDefinitionId ? 'Campaign Manager' : null,
          createdAt: '2026-03-31T00:00:00.000Z',
          updatedAt: '2026-03-31T00:00:00.000Z',
        });
        return HttpResponse.json({ ok: true });
      }),
      http.put('/api/settings/access/:id', async ({ params, request }) => {
        const body = (await request.json()) as {
          email: string;
          role: string | null;
          roleDefinitionId: number | null;
        };
        const index = items.findIndex((item) => item.id === Number(params.id));
        items[index] = {
          ...items[index],
          email: body.email,
          role: body.role ?? 'viewer',
          roleDefinitionId: body.roleDefinitionId,
          roleLabel: body.roleDefinitionId ? 'Campaign Manager' : null,
        };
        return HttpResponse.json({ ok: true });
      }),
    );

    renderPanel();

    expect(await screen.findByText('viewer@example.com')).toBeInTheDocument();
    expect(screen.getByText('settings.accessManager.columns.assignment')).toHaveClass(
      'whitespace-normal',
    );

    await userEvent.type(
      screen.getByPlaceholderText('settings.accessManager.emailPlaceholder'),
      'employee@example.com',
    );
    await userEvent.selectOptions(
      screen.getByLabelText('settings.accessManager.assignmentLabel'),
      'built-in:employee',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'settings.accessManager.createAction' }),
    );

    await waitFor(() => {
      expect(screen.getByText('employee@example.com')).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'actions.edit' })[1]);
    await userEvent.selectOptions(
      screen.getByLabelText('settings.accessManager.assignmentLabel'),
      'custom:7',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'settings.accessManager.updateAction' }),
    );

    await waitFor(() => {
      expect(screen.getAllByText('Campaign Manager').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('employee@example.com')).toHaveClass('break-all');
  });
});
