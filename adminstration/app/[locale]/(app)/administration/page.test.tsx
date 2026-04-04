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

vi.mock('../../../../db/client', () => ({
  hasDb: vi.fn(() => true),
  getDb: vi.fn(() => ({ tag: 'db' })),
}));

vi.mock('../../../../lib/ecotrack', () => ({
  readEcotrackCatalog: vi.fn(async () => ({
    wilayas: [],
    communes: [],
    serviceFees: [],
    weightFees: [],
    lastSync: {
      id: 1,
      trigger: 'manual',
      status: 'success',
      requestCount: 3,
      wilayaCount: 58,
      communeCount: 1542,
      serviceFeeCount: 280,
      weightFeeCount: 4,
      rateLimitSnapshot: null,
      errorMessage: null,
      startedAt: new Date('2026-03-30T21:08:20.000Z'),
      finishedAt: new Date('2026-03-30T21:08:29.000Z'),
      createdAt: new Date('2026-03-30T21:08:29.000Z'),
      updatedAt: new Date('2026-03-30T21:08:29.000Z'),
    },
  })),
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
        'settings.general.currentRoleLabel': 'Current role',
        'settings.general.signedInEmailLabel': 'Signed-in email',
        'settings.general.missingEmail': 'No email available',
        'settings.ecotrack.title': 'ECOTRACK catalog sync',
        'settings.ecotrack.lastFetchLabel': 'Last fetched',
        'settings.ecotrack.statusLabel': 'Status',
        'settings.ecotrack.statusSuccess': 'Succeeded',
        'settings.ecotrack.statusFailed': 'Failed',
        'settings.ecotrack.statusUnknown': 'Never run',
        'settings.ecotrack.neverSynced': 'Never synced',
        'settings.ecotrack.errorLabel': 'Last error',
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
    expect(screen.getByText('ECOTRACK catalog sync')).toBeInTheDocument();
    expect(screen.getAllByText('Succeeded').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('private-contact-01@example.invalid').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Current role').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('UserAccessPanel')).toBeInTheDocument();
    expect(screen.getByText('RoleManagementPanel')).toBeInTheDocument();
    expect(screen.getByText('ActionHistoryPanel')).toBeInTheDocument();
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
