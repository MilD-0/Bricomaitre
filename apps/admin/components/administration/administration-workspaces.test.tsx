import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/mocks/server';
import { AdministrationRolesWorkspace } from './administration-roles-workspace';
import { AdministrationUsersWorkspace } from './administration-users-workspace';

const surfaceDetailsMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.count === undefined ? key : `${values.count} ${key}`,
}));

vi.mock('../../lib/toast', () => ({
  toast: { loading: vi.fn(() => 'toast'), success: vi.fn(), error: vi.fn() },
}));
vi.mock('../admin-ai-surface-context', () => ({
  useAdminAiSurfaceDetails: surfaceDetailsMock,
}));

function renderWorkspace(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('Administration workspaces', () => {
  afterEach(cleanup);

  it('uses a list-first user workflow and confirms access removal', async () => {
    const deleteHandler = vi.fn(() => HttpResponse.json({ ok: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.get('/api/settings/access', () =>
        HttpResponse.json({
          items: [
            {
              id: 4,
              email: 'staff@example.com',
              role: 'employee',
              roleDefinitionId: null,
              roleLabel: null,
              updatedAt: '2026-08-19T00:00:00.000Z',
            },
          ],
          availableBuiltInRoles: ['viewer', 'employee'],
          availableCustomRoles: [],
        }),
      ),
      http.delete('/api/settings/access/4', deleteHandler),
    );

    renderWorkspace(<AdministrationUsersWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: /staff@example.com/i }));
    expect(surfaceDetailsMock).toHaveBeenCalledWith({
      selection: { entityType: 'accessGrant', ids: [4], focusedId: 4 },
    });
    await userEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

    expect(confirm).toHaveBeenCalledWith('settings.accessManager.deleteConfirmation');
    await waitFor(() => expect(deleteHandler).toHaveBeenCalled());
    confirm.mockRestore();
  });

  it('offers analytics_manage in the shared role editor', async () => {
    server.use(
      http.get('/api/settings/roles', () =>
        HttpResponse.json({
          items: [],
          availablePermissions: ['products_write', 'analytics_manage', 'settings_manage'],
        }),
      ),
    );

    renderWorkspace(<AdministrationRolesWorkspace />);
    await userEvent.click(
      screen.getByRole('button', { name: 'settings.rolesManager.createAction' }),
    );
    expect(
      await screen.findByText('settings.permissionLabels.analytics_manage'),
    ).toBeInTheDocument();
    expect(screen.getByText('settings.permissionLabels.settings_manage')).toBeInTheDocument();
  });

  it('publishes the exact selected role definition to the assistant', async () => {
    server.use(
      http.get('/api/settings/roles', () =>
        HttpResponse.json({
          items: [
            {
              id: 7,
              name: 'Support',
              slug: 'support',
              description: null,
              permissions: ['orders_write'],
            },
          ],
          availablePermissions: ['orders_write'],
        }),
      ),
    );

    renderWorkspace(<AdministrationRolesWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: /Support/ }));
    expect(surfaceDetailsMock).toHaveBeenCalledWith({
      selection: { entityType: 'roleDefinition', ids: [7], focusedId: 7 },
    });
  });
});
