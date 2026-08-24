import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  signOutMock,
  pushMock,
  refreshMock,
  usePathnameMock,
  useSearchParamsMock,
  useTranslationsMock,
  addEventListenerMock,
  removeEventListenerMock,
} = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  usePathnameMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
  useTranslationsMock: vi.fn(),
  addEventListenerMock: vi.fn(),
  removeEventListenerMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: useTranslationsMock,
}));

vi.mock('next/link', () => ({
  default: (
    linkProps: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      prefetch?: boolean;
    },
  ) => {
    const { children, href, className, prefetch, ...props } = linkProps;
    return (
      <a
        href={href}
        className={className}
        data-prefetch={prefetch === false ? 'false' : 'true'}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useSearchParams: useSearchParamsMock,
}));

vi.mock('../../lib/auth-client', () => ({
  authClient: { signOut: signOutMock },
}));

vi.mock('../theme-toggle', () => ({
  ThemeToggle: () => <button type="button">theme-toggle</button>,
}));

vi.mock('../admin-ai-chat', () => ({
  AdminAiChat: () => <div>Admin AI assistant</div>,
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
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hash: '',
        pathname: '/en/administration',
        protocol: 'https:',
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
      if (key === 'labels.roleManagedByCode')
        return 'Admin and developer roles are code-managed by email.';
      if (key === 'labels.userProfile') return 'User profile';
      if (key === 'auth.signOut') return 'Sign out';
      if (key === 'profile.legacyUi') return 'Legacy UI';
      if (key === 'profile.legacyUiDescription')
        return 'Use the original Products, Orders, Assets, Landing Pages, and Stats interfaces.';
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
      if (key === 'nav.statsOverview') return 'Overview';
      if (key === 'nav.statsMoney') return 'Money';
      if (key === 'nav.statsAcquisition') return 'Acquisition';
      if (key === 'nav.statsFulfillment') return 'Fulfillment';
      if (key === 'nav.statsStorefront') return 'Storefront';
      if (key === 'nav.statsAiOperations') return 'AI operations';
      if (key === 'nav.statsShoppingAssistant') return 'Shopping assistant';
      if (key === 'nav.statsSearch') return 'Search visibility';
      if (key === 'nav.statsCatalog') return 'Catalog';
      if (key === 'nav.statsAssumptions') return 'Costs & assumptions';
      if (key.startsWith('nav.')) return key;
      return key;
    });
  });

  it('preserves the active analytics range across stats navigation', () => {
    usePathnameMock.mockReturnValue('/en/stats/time');
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('range=custom&startDate=2026-08-01&endDate=2026-08-15&grain=week'),
    );
    render(
      <AppShell
        initialPermissions={['analytics_manage']}
        initialRole="employee"
        initialLegacyUi={false}
      >
        <div>child</div>
      </AppShell>,
    );
    const acquisitionLink = screen.getByRole('link', { name: 'Acquisition' });
    expect(acquisitionLink).toHaveAttribute(
      'href',
      '/en/stats/meta-ads?range=custom&startDate=2026-08-01&endDate=2026-08-15&grain=week',
    );
    expect(acquisitionLink).toHaveAttribute('data-prefetch', 'false');
  });

  it('uses a flat desktop navigation rail with a compact collapsed state', async () => {
    usePathnameMock.mockReturnValue('/en/products');
    const view = render(
      <AppShell
        initialPermissions={['products_write', 'orders_write', 'assets_write']}
        initialRole="employee"
        initialUserEmail="operator@example.com"
      >
        <div>child</div>
      </AppShell>,
    );

    const sidebar = view.container.querySelector('[data-desktop-navigation]');
    const navigation = view.container.querySelector('[data-desktop-navigation-list]');
    const activeLink = screen.getByRole('link', { name: 'nav.products' });

    expect(sidebar).toHaveClass('lg:w-[17rem]', 'lg:rounded-xl', 'lg:shadow-sm');
    expect(navigation).not.toHaveClass('lg:bg-card/60', 'lg:shadow-[var(--shadow-vapor)]');
    expect(activeLink).toHaveAttribute('data-navigation-active', 'true');
    expect(activeLink).toHaveClass('bg-primary/10');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar).toHaveClass('lg:w-[4.75rem]');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(activeLink).toHaveAttribute('title', 'nav.products');
  });

  it('associates the product archive with the Products navigation family', () => {
    usePathnameMock.mockReturnValue('/en/archive');
    const view = render(
      <AppShell
        initialPermissions={['products_write']}
        initialRole="employee"
        initialLegacyUi={false}
      >
        <div>archive</div>
      </AppShell>,
    );

    const mobileHeader = view.container.querySelector('[data-mobile-workflow-header]');
    expect(within(mobileHeader as HTMLElement).getByText('nav.products')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.products' })).toHaveAttribute(
      'data-navigation-active',
      'true',
    );
  });

  it('syncs the persisted store role from the authenticated role', async () => {
    render(
      <AppShell
        initialPermissions={[
          'products_write',
          'orders_write',
          'assets_write',
          'brands_categories_write',
          'ops_view',
          'analytics_manage',
          'settings_manage',
        ]}
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
      expect(useAppStore.getState().permissions).toEqual([
        'products_write',
        'orders_write',
        'assets_write',
        'brands_categories_write',
        'ops_view',
        'analytics_manage',
        'settings_manage',
      ]);
    });

    expect(screen.getByLabelText('BricAdmin')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'BricAdmin' })).not.toBeInTheDocument();
    expect(screen.queryByText('Brico Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.queryByText('pages.administration')).not.toBeInTheDocument();
    expect(screen.getAllByText('nav.administration').length).toBeGreaterThan(0);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getAllByAltText('Ada Lovelace')[0]).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'theme-toggle' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'nav.administration' })).toHaveAttribute(
      'href',
      '/en/administration',
    );
    expect(
      screen.getByRole('link', { name: 'nav.administration' }).querySelector('span'),
    ).toHaveClass('whitespace-normal');
    await userEvent.click(screen.getByRole('button', { name: 'Show nav.assets submenu' }));
    expect(screen.getByRole('link', { name: 'Banners' })).toHaveAttribute(
      'href',
      '/en/assets#banners',
    );
    expect(screen.getByRole('link', { name: 'Landing pages' })).toHaveAttribute(
      'href',
      '/en/landing-pages',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Show nav.brandsCategories submenu' }),
    );
    expect(screen.getByRole('link', { name: 'nav.brands' })).toHaveAttribute('href', '/en/brands');
    expect(screen.getByRole('link', { name: 'nav.categories' })).toHaveAttribute(
      'href',
      '/en/categories',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show nav.stats submenu' }));
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/en/stats');
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'href',
      '/en/stats/products',
    );
    expect(screen.getByRole('link', { name: 'Landing stats' })).toHaveAttribute(
      'href',
      '/en/stats/landing-pages',
    );
    expect(screen.getByRole('link', { name: 'AI assistants' })).toHaveAttribute(
      'href',
      '/en/stats/ai-assistants',
    );
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/en/stats/customers',
    );
    expect(screen.queryByRole('link', { name: 'Paid clicks' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manual orders' })).toHaveAttribute(
      'href',
      '/en/stats/manual-orders',
    );
    expect(screen.getByRole('link', { name: 'Import spreadsheet' })).toHaveAttribute(
      'href',
      '/en/stats/import-history',
    );
    expect(screen.queryByRole('link', { name: 'nav.dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.aiProposals' })).toHaveAttribute(
      'href',
      '/en/ai-proposals',
    );

    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    const legacyUiSwitch = within(dialog).getByRole('switch', { name: 'Legacy UI' });
    expect(legacyUiSwitch).toBeChecked();

    await userEvent.click(legacyUiSwitch);

    expect(legacyUiSwitch).not.toBeChecked();
    expect(document.cookie).toContain('bric-admin-legacy-ui=0');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Featured product groups' })).toHaveAttribute(
      'href',
      '/en/assets/featured-groups',
    );
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/en/assets/product-cards',
    );
    expect(screen.getByRole('link', { name: 'Landing pages' })).toHaveAttribute(
      'href',
      '/en/assets/landing-pages',
    );
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/en/stats/time');
    expect(screen.getByRole('link', { name: 'Fulfillment' })).toHaveAttribute(
      'href',
      '/en/stats/fulfillment',
    );
    expect(screen.getByRole('link', { name: 'AI operations' })).toHaveAttribute(
      'href',
      '/en/stats/ai-assistants',
    );
    expect(screen.getByRole('link', { name: 'Shopping assistant' })).toHaveAttribute(
      'href',
      '/en/stats/shopping-assistant',
    );
    expect(screen.getByRole('link', { name: 'Search visibility' })).toHaveAttribute(
      'href',
      '/en/stats/search',
    );
    expect(screen.queryByRole('link', { name: 'Import spreadsheet' })).not.toBeInTheDocument();
  });

  it('derives AI proposal review from catalog permissions', async () => {
    render(
      <AppShell
        initialPermissions={['products_write']}
        initialRole="employee"
        initialUserEmail="catalog@example.com"
      >
        <div>child</div>
      </AppShell>,
    );

    expect(await screen.findByRole('link', { name: 'nav.aiProposals' })).toHaveAttribute(
      'href',
      '/en/ai-proposals',
    );
    expect(screen.getByText('Admin AI assistant')).toBeInTheDocument();
  });

  it('shows the AI assistant to an allowed viewer without operation permissions', () => {
    render(
      <AppShell initialPermissions={[]} initialRole="viewer" initialUserEmail="viewer@example.com">
        <div>child</div>
      </AppShell>,
    );

    expect(screen.getByText('Admin AI assistant')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'nav.aiProposals' })).not.toBeInTheDocument();
  });

  it('presents the current workflow without a mobile bottom dock', async () => {
    usePathnameMock.mockReturnValue('/en/orders/ecotrack');
    render(
      <AppShell
        initialPermissions={['products_write', 'orders_write']}
        initialRole="employee"
        initialUserEmail="mobile@example.com"
      >
        <div>child</div>
      </AppShell>,
    );

    const mobileHeader = document.querySelector('[data-mobile-workflow-header]');
    expect(mobileHeader).not.toBeNull();
    expect(document.querySelector('[data-mobile-navigation-dock]')).toBeNull();
    expect(within(mobileHeader as HTMLElement).getByText('nav.ecotrackShipments')).toBeVisible();
    expect(within(mobileHeader as HTMLElement).getByText('nav.orders')).toBeVisible();

    await userEvent.click(
      within(mobileHeader as HTMLElement).getByRole('button', {
        name: 'Open sidebar',
      }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('link', { name: 'nav.products' })).toHaveAttribute(
      'href',
      '/en/products',
    );
    expect(screen.getByRole('link', { name: 'nav.orders' })).toHaveAttribute('href', '/en/orders');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
  });

  it('does not render the old role selector UI', async () => {
    render(
      <AppShell
        initialPermissions={['products_write']}
        initialRole="employee"
        initialUserEmail="team@example.com"
      >
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
    expect(signOutMock).toHaveBeenCalledWith({
      fetchOptions: { onSuccess: expect.any(Function) },
    });
    signOutMock.mock.calls[0][0].fetchOptions.onSuccess();
    expect(pushMock).toHaveBeenCalledWith('/');
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
    expect(screen.getByRole('link', { name: 'nav.administration' })).toHaveAttribute(
      'href',
      '/en/administration',
    );
    expect(screen.queryByRole('link', { name: 'nav.dashboard' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Campaign Manager')).toBeInTheDocument();
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops controls and logs are available.')).not.toBeInTheDocument();
  });
});
