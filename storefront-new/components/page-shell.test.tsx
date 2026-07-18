import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ settings: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('fr'),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/footer-contact-link', () => ({ FooterContactLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/global-search', () => ({ GlobalSearch: () => null }));
vi.mock('@/components/navigation-actions', () => ({ NavigationActions: () => null }));
vi.mock('@/components/navigation-categories', () => ({ NavigationCategories: () => null }));
vi.mock('@/components/shopping-assistant-launcher', () => ({ ShoppingAssistantLauncher: () => <button type="button">AI advisor</button> }));
vi.mock('@/lib/storefront-api', () => ({ getStorefrontSettings: mocks.settings }));

import { PageShell } from './page-shell';

describe('PageShell storefront AI setting', () => {
  beforeEach(() => mocks.settings.mockReset());
  afterEach(cleanup);

  it('renders the shopping advisor when enabled', async () => {
    mocks.settings.mockResolvedValue({ phoneDisplay: '0795 34 28 26', phoneHref: 'tel:+213795342826', phoneEnabled: false, aiAssistantEnabled: true });
    render(await PageShell({ locale: 'fr', children: <p>Catalog</p> }));
    expect(screen.getByRole('button', { name: 'AI advisor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'offers' })).toHaveAttribute('href', '/fr/products?discounted=1');
  });

  it('removes the shopping advisor when disabled by admin', async () => {
    mocks.settings.mockResolvedValue({ phoneDisplay: '0795 34 28 26', phoneHref: 'tel:+213795342826', phoneEnabled: true, aiAssistantEnabled: false });
    render(await PageShell({ locale: 'fr', children: <p>Catalog</p> }));
    expect(screen.queryByRole('button', { name: 'AI advisor' })).not.toBeInTheDocument();
  });
});
