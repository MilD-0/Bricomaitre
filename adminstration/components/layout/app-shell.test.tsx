import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signOutMock, pushMock, usePathnameMock, useTranslationsMock, addEventListenerMock, removeEventListenerMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
  usePathnameMock: vi.fn(),
  useTranslationsMock: vi.fn(),
  addEventListenerMock: vi.fn(),
  removeEventListenerMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: useTranslationsMock,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('next-auth/react', () => ({
  signOut: signOutMock,
}));

vi.mock('../theme-toggle', () => ({
  ThemeToggle: () => <button type="button">theme-toggle</button>,
}));

import { AppShell } from './app-shell';
import { useAppStore } from '../../store/app-store';

describe('AppShell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ permissions: [], role: 'viewer', roleLabel: null });
    usePathnameMock.mockReturnValue('/en/administration');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hash: '',
        pathname: '/en/administration',
      },
    });
    window.addEventListener = addEventListenerMock;
    window.removeEventListener = removeEventListenerMock;
    useTranslationsMock.mockReturnValue((key: string, values?: Record<string, string>) => {
      if (key === 'labels.currentRole') {
        return `Current role: ${values?.role}`;
      }

      if (key === 'labels.roles') return 'Roles';
      if (key === 'roles.admin') return 'Admin';
      if (key === 'roles.employee') return 'Employee';
      if (key === 'auth.unknownUser') return 'Unknown user';
      if (key === 'settings.general.missingEmail') return 'No email available';
      if (key === 'labels.roleManagedByCode') return 'Admin and developer roles are code-managed by email.';
      if (key === 'labels.userProfile') return 'User profile';
      if (key === 'auth.signOut') return 'Sign out';
      if (key === 'labels.opsAccess') return 'Ops controls and logs are available.';
      if (key === 'assetsManager.bannersTitle') return 'Banners';
      if (key === 'assetsManager.groupsTitle') return 'Featured product groups';
      if (key === 'assetsManager.cardsTitle') return 'Cards';
      if (key === 'nav.landingPages') return 'Landing pages';
      if (key === 'statsDashboard.tabs.overview') return 'Overview';
      if (key === 'statsDashboard.tabs.landingPages') return 'Landing stats';
      if (key === 'statsDashboard.tabs.aiAssistants') return 'AI assistants';
      if (key === 'statsDashboard.tabs.customers') return 'Customers';
      if (key === 'statsDashboard.tabs.products') return 'Products';
      if (key === 'statsDashboard.tabs.geography') return 'Geography';
      if (key === 'statsDashboard.tabs.time') return 'Time';
      if (key === 'statsDashboard.tabs.metaAds') return 'Meta ads';
      if (key === 'statsDashboard.manualOrders.sectionTitle') return 'Manual orders';
      if (key === 'statsDashboard.imports.title') return 'Import spreadsheet';
      if (key.startsWith('nav.')) return key;
      return key;
    });
  });

  it('syncs the persisted store role from the authenticated role', async () => {
    render(
      <AppShell
        initialPermissions={['products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'ops_view', 'settings_manage']}
        initialRole="admin"
        initialUserEmail="ada@example.com"
        initialUserImage="https://example.com/avatar.png"
        initialUserName="Ada Lovelace"
      >
        <div>child</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(useAppStore.getState().role).toBe('admin');
      expect(useAppStore.getState().permissions).toEqual(['products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'ops_view', 'settings_manage']);
    });

    expect(screen.getByRole('heading', { name: 'BricAdmin' })).toBeInTheDocument();
    expect(screen.queryByText('Brico Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.getByText('pages.administration')).toBeInTheDocument();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByAltText('Ada Lovelace')).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'theme-toggle' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'nav.administration' })).toHaveAttribute('href', '/en/administration');
    expect(screen.getByRole('link', { name: 'nav.administration' }).querySelector('span')).toHaveClass('whitespace-normal');
    expect(screen.getByRole('link', { name: 'Banners' })).toHaveAttribute('href', '/en/assets#banners');
    expect(screen.getByRole('link', { name: 'Landing pages' })).toHaveAttribute('href', '/en/landing-pages');
    expect(screen.getByRole('link', { name: 'nav.brands' })).toHaveAttribute('href', '/en/brands');
    expect(screen.getByRole('link', { name: 'nav.categories' })).toHaveAttribute('href', '/en/categories');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/en/stats');
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/en/stats/products');
    expect(screen.getByRole('link', { name: 'Landing stats' })).toHaveAttribute('href', '/en/stats/landing-pages');
    expect(screen.getByRole('link', { name: 'AI assistants' })).toHaveAttribute('href', '/en/stats/ai-assistants');
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/en/stats/customers');
    expect(screen.queryByRole('link', { name: 'Paid clicks' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manual orders' })).toHaveAttribute('href', '/en/stats/manual-orders');
    expect(screen.getByRole('link', { name: 'Import spreadsheet' })).toHaveAttribute('href', '/en/stats/import-history');
    expect(screen.queryByRole('link', { name: 'nav.dashboard' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('does not render the old role selector UI', async () => {
    render(
      <AppShell initialPermissions={['products_write']} initialRole="employee" initialUserEmail="team@example.com">
        <div>child</div>
      </AppShell>,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByText('team@example.com').length).toBeGreaterThan(0);
    expect(screen.queryByText('Employee')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'theme-toggle' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'nav.administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'nav.dashboard' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('renders custom role labels without requiring a translation key', async () => {
    render(
      <AppShell
        initialPermissions={['settings_manage']}
        initialRole="campaign-manager"
        initialRoleLabel="Campaign Manager"
        initialUserName="Jordan Admin"
      >
        <div>child</div>
      </AppShell>,
    );

    expect(screen.getByText('Jordan Admin')).toBeInTheDocument();
    expect(screen.queryByText('Campaign Manager')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'theme-toggle' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'nav.administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'nav.dashboard' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Campaign Manager')).toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
  });
});
