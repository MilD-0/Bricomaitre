import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === 'settings.rolesManager.existingCount') {
      return `${values?.count ?? '0'} roles`;
    }

    return key;
  },
}));

vi.mock('../../lib/toast', () => ({
  toast: toastMock,
}));

import { RoleManagementPanel } from './role-management-panel';
import { server } from '../../test/mocks/server';

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RoleManagementPanel />
    </QueryClientProvider>,
  );
}

describe('RoleManagementPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('creates a custom role with selected permissions', async () => {
    const items: Array<{ id: number; name: string; slug: string; description: string | null; isSystem: boolean; permissions: string[]; createdAt: string; updatedAt: string }> = [
      {
        id: 1,
        name: 'Support',
        slug: 'support',
        description: 'Existing support role',
        isSystem: false,
        permissions: ['orders_write'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

     server.use(
       http.get('/api/settings/roles', () => HttpResponse.json({
         items,
         availablePermissions: [
           'products_write',
           'orders_write',
           'assets_write',
           'brands_categories_write',
           'ops_view',
           'settings_manage',
         ],
       })),
       http.post('/api/settings/roles', async ({ request }) => {
         const body = (await request.json()) as { name: string; description?: string; permissions: string[] };
         items.push({
           id: 2,
           name: body.name,
           slug: 'campaign-manager',
           description: body.description ?? null,
           isSystem: false,
           permissions: body.permissions as ('products_write' | 'orders_write')[],
           createdAt: '2026-01-02T00:00:00.000Z',
           updatedAt: '2026-01-02T00:00:00.000Z',
         });
         return HttpResponse.json({ ok: true });
       }),
     );

     renderPanel();

     expect(await screen.findByText('Support')).toBeInTheDocument();
     expect(screen.getByText('settings.permissions.customRolesTitle')).toBeInTheDocument();

     await userEvent.clear(screen.getByPlaceholderText('settings.rolesManager.namePlaceholder'));
     await userEvent.type(screen.getByPlaceholderText('settings.rolesManager.namePlaceholder'), 'Campaign Manager');
     await userEvent.click(screen.getByLabelText('settings.permissionLabels.brands_categories_write'));
     await userEvent.click(screen.getByLabelText('settings.permissionLabels.settings_manage'));
     await userEvent.click(screen.getByRole('button', { name: 'settings.rolesManager.createAction' }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Manager')).toBeInTheDocument();
    });
  });

  it('loads an existing role into the form for editing', async () => {
    const items: Array<{ id: number; name: string; slug: string; description: string | null; isSystem: boolean; permissions: string[]; createdAt: string; updatedAt: string }> = [
      {
        id: 3,
        name: 'Analyst',
        slug: 'analyst',
        description: 'Reads dashboards and ads data',
        isSystem: false,
        permissions: ['assets_write', 'settings_manage'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    server.use(
      http.get('/api/settings/roles', () => HttpResponse.json({
        items,
        availablePermissions: [
          'products_write',
          'orders_write',
          'assets_write',
          'brands_categories_write',
          'ops_view',
          'settings_manage',
        ],
      })),
    );

    renderPanel();

    expect(await screen.findByText('Analyst')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'settings.rolesManager.editAction' }));

    expect(screen.getByDisplayValue('Analyst')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.rolesManager.updateAction' })).toBeInTheDocument();
  });
});
