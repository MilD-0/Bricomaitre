import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, getTranslationsMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getTranslationsMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../components/settings/role-management-panel', () => ({
  RoleManagementPanel: () => <div>RoleManagementPanel</div>,
}));

vi.mock('../../../../components/settings/user-access-panel', () => ({
  UserAccessPanel: () => <div>UserAccessPanel</div>,
}));

vi.mock('../../../../components/action-history-panel', () => ({
  ActionHistoryPanel: () => <div>ActionHistoryPanel</div>,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import AdministrationPage from './page';

describe('AdministrationPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => {
      const translations: Record<string, string> = {
        'nav.administration': 'Administration',
        'roles.viewer': 'Viewer',
        'roles.employee': 'Employee',
        'roles.admin': 'Admin',
        'roles.developer': 'Developer',
      };

      return translations[key] ?? key;
    });
  });

  it('renders administration content and action history for developers', async () => {
    authMock.mockResolvedValue({
      user: {
        email: 'private-contact-01@example.invalid',
        permissions: ['ops_view', 'settings_manage'],
        role: 'developer',
      },
    });

    const ui = await AdministrationPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByText('UserAccessPanel')).toBeInTheDocument();
    expect(screen.getByText('RoleManagementPanel')).toBeInTheDocument();
    expect(screen.getByText('ActionHistoryPanel')).toBeInTheDocument();
    expect(screen.queryByText('ECOTRACK catalog sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Current role')).not.toBeInTheDocument();
    expect(screen.queryByText('private-contact-01@example.invalid')).not.toBeInTheDocument();
    expect(screen.queryByText('Permissions & roles config')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration overview and action history.')).not.toBeInTheDocument();
    expect(screen.queryByText('Role assignment policy')).not.toBeInTheDocument();
  });

  it('redirects non-admin and non-developer users away from administration', async () => {
    authMock.mockResolvedValue({
      user: {
        email: 'employee@example.com',
        isAllowed: true,
        permissions: ['products_write'],
        role: 'employee',
      },
    });

    const ui = await AdministrationPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(redirectMock).toHaveBeenCalledWith('/en/products');
  });
});
