import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ settings: vi.fn(), content: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('fr'),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/image', () => ({
  default: ({
    alt,
    fetchPriority,
    loading,
  }: {
    alt: string;
    fetchPriority?: string;
    loading?: string;
  }) => (
    <span role="img" aria-label={alt} data-fetch-priority={fetchPriority} data-loading={loading} />
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/footer-contact-link', () => ({
  FooterContactLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/global-search', () => ({
  GlobalSearch: ({ instanceId }: { instanceId: string }) => (
    <div data-testid="global-search" data-instance-id={instanceId} />
  ),
}));
vi.mock('@/components/navigation-actions', () => ({ NavigationActions: () => null }));
vi.mock('@/components/navigation-categories', () => ({ NavigationCategories: () => null }));
vi.mock('@/components/shopping-assistant-launcher', () => ({
  ShoppingAssistantLauncher: () => <button type="button">AI advisor</button>,
}));
vi.mock('@/lib/storefront-api', () => ({
  getStorefrontSettings: mocks.settings,
  getStorefrontContent: mocks.content,
}));

import { PageShell } from './page-shell';

describe('PageShell storefront AI setting', () => {
  beforeEach(() => {
    mocks.settings.mockReset();
    mocks.content.mockReset().mockResolvedValue({ announcement: null });
  });
  afterEach(cleanup);

  it('renders the shopping advisor when enabled', async () => {
    mocks.settings.mockResolvedValue({
      ...defaultStorefrontSettingsResponse,
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: false,
      aiAssistantEnabled: true,
    });
    render(await PageShell({ locale: 'fr', children: <p>Catalog</p> }));
    expect(screen.getByRole('button', { name: 'AI advisor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'offers' })).toHaveAttribute(
      'href',
      '/fr/products?discounted=1',
    );
    expect(screen.getAllByRole('img', { name: 'Bricomaitre' })[0]).toHaveAttribute(
      'data-loading',
      'eager',
    );
    expect(screen.getAllByRole('img', { name: 'Bricomaitre' })[0]).toHaveAttribute(
      'data-fetch-priority',
      'high',
    );
    expect(screen.getByTestId('global-search')).toHaveAttribute('data-instance-id', 'header');
  });

  it('removes the shopping advisor when disabled by admin', async () => {
    mocks.settings.mockResolvedValue({
      ...defaultStorefrontSettingsResponse,
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
    render(await PageShell({ locale: 'fr', children: <p>Catalog</p> }));
    expect(screen.queryByRole('button', { name: 'AI advisor' })).not.toBeInTheDocument();
  });

  it('reuses page-fetched settings instead of repeating an upstream request', async () => {
    render(
      await PageShell({
        locale: 'fr',
        children: <p>Catalog</p>,
        contactSettings: {
          ...defaultStorefrontSettingsResponse,
          phoneDisplay: '0795 34 28 26',
          phoneHref: 'tel:+213795342826',
          phoneEnabled: true,
          aiAssistantEnabled: false,
        },
      }),
    );

    expect(mocks.settings).not.toHaveBeenCalled();
    expect(screen.getByText('0795 34 28 26')).toBeInTheDocument();
  });

  it.each([
    ['/fr/products/drill?promo=OFFER', 'fr', undefined, '/ar/products/drill?promo=OFFER'],
    [
      '/fr/landing/drill?source=campaign',
      'fr',
      '/ar/landing/drill-ar',
      '/ar/landing/drill-ar?source=campaign',
    ],
    ['/ar/thank-you?token=signed-token', 'ar', undefined, '/fr/thank-you?token=signed-token'],
  ] as const)(
    'preserves the footer language destination for %s',
    async (path, locale, alternatePath, expected) => {
      window.history.replaceState({}, '', path);
      render(
        await PageShell({
          locale,
          alternatePath,
          children: <p>Page</p>,
          contactSettings: defaultStorefrontSettingsResponse,
        }),
      );
      expect(
        screen.getByRole('link', { name: locale === 'fr' ? 'العربية' : 'FR' }),
      ).toHaveAttribute('href', expected);
      expect(
        screen.getByRole('link', { name: locale === 'fr' ? 'FR' : 'العربية' }),
      ).toHaveAttribute('href', path);
    },
  );
});
