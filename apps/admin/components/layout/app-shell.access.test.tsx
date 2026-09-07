import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  signOutMock,
  pushMock,
  usePathnameMock,
  useSearchParamsMock,
  useTranslationsMock,
  addEventListenerMock,
  removeEventListenerMock,
} = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
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
      prefetch?: boolean | null;
    },
  ) => {
    const { children, href, className, prefetch, ...props } = linkProps;
    return (
      <a
        href={href}
        className={className}
        data-prefetch={prefetch === false ? 'false' : prefetch === true ? 'true' : 'auto'}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
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

describe('AppShell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
      if (key === 'labels.opsAccess') return 'Ops controls and logs are available.';
      if (key === 'assetsManager.bannersTitle') return 'Banners';
      if (key === 'assetsManager.groupsTitle') return 'Featured product groups';
      if (key === 'assetsManager.cardsTitle') return 'Cards';
      if (key === 'nav.landingPages') return 'Landing pages';
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

  it('updates navigation and profile directly when authenticated access changes', async () => {
    const view = render(
      <AppShell initialPermissions={['orders_write']} initialRole="employee">
        orders
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'nav.orders' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'nav.administration' })).not.toBeInTheDocument();
    view.rerender(
      <AppShell
        initialPermissions={['settings_manage']}
        initialRole="campaign-manager"
        initialRoleLabel="Campaign Manager"
      >
        settings
      </AppShell>,
    );
    expect(screen.queryByRole('link', { name: 'nav.orders' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.administration' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'User profile' }));
    expect(within(screen.getByRole('dialog')).getByText('Campaign Manager')).toBeInTheDocument();
  });

  it('keeps the mobile sidebar open until the pathname actually changes', async () => {
    usePathnameMock.mockReturnValue('/en/orders');
    const view = render(
      <AppShell initialPermissions={['orders_write']} initialRole="employee">
        <div>orders</div>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    view.rerender(
      <AppShell initialPermissions={['orders_write']} initialRole="employee">
        <div>same orders route</div>
      </AppShell>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    usePathnameMock.mockReturnValue('/en/products');
    view.rerender(
      <AppShell initialPermissions={['orders_write']} initialRole="employee">
        <div>products</div>
      </AppShell>,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
