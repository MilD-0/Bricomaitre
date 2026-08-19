import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  loadSettings: vi.fn(),
  loadContent: vi.fn(),
  modelOptions: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('../../lib/page-access', () => ({ requireAdministrationPageAccess: mocks.access }));
vi.mock('../../lib/storefront-settings', () => ({
  loadStorefrontSettings: mocks.loadSettings,
  getStorefrontAiModelOptions: mocks.modelOptions,
  normalizeStorefrontAiModels: (value: unknown) => value,
}));
vi.mock('../../lib/storefront-content', () => ({ loadStorefrontContentAdmin: mocks.loadContent }));
vi.mock('./administration-shell', () => ({
  AdministrationShell: ({ children, section }: { children: React.ReactNode; section: string }) => (
    <div data-section={section}>{children}</div>
  ),
}));
vi.mock('./administration-users-workspace', () => ({
  AdministrationUsersWorkspace: () => <div>Users workspace</div>,
}));
vi.mock('./administration-roles-workspace', () => ({
  AdministrationRolesWorkspace: () => <div>Roles workspace</div>,
}));
vi.mock('./administration-storefront-workspace', () => ({
  AdministrationStorefrontWorkspace: () => <div>Storefront workspace</div>,
}));
vi.mock('../action-history-panel', () => ({
  ActionHistoryPanel: () => <div>History workspace</div>,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

import { AdministrationPage } from './administration-page';

describe('AdministrationPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSettings.mockResolvedValue({ contactPhone: '0550000000' });
    mocks.loadContent.mockResolvedValue({ active: false, messageFr: '', messageAr: '' });
    mocks.modelOptions.mockReturnValue(['model']);
  });

  it.each([
    ['users', 'Users workspace'],
    ['roles', 'Roles workspace'],
    ['history', 'History workspace'],
  ])(
    'renders the URL-backed %s view without loading storefront configuration',
    async (section, expected) => {
      render(await AdministrationPage({ locale: 'fr', section }));
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(mocks.access).toHaveBeenCalledWith('fr');
      expect(mocks.loadSettings).not.toHaveBeenCalled();
    },
  );

  it('loads storefront configuration only for the storefront view', async () => {
    render(await AdministrationPage({ locale: 'ar', section: 'storefront' }));
    expect(screen.getByText('Storefront workspace')).toBeInTheDocument();
    expect(mocks.loadSettings).toHaveBeenCalledOnce();
    expect(mocks.loadContent).toHaveBeenCalledOnce();
  });

  it('rejects unknown Administration sections before loading protected data', async () => {
    await expect(AdministrationPage({ locale: 'fr', section: 'unknown' })).rejects.toThrow(
      'not found',
    );

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.loadSettings).not.toHaveBeenCalled();
  });
});
