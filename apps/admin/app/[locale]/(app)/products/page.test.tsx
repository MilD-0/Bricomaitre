import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, getTranslationsMock, requireProductsPageAccessMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getTranslationsMock: vi.fn(),
  requireProductsPageAccessMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('../../../../components/products-manager', () => ({
  ProductsManager: () => <div>ProductsManager</div>,
}));

vi.mock('../../../../components/products/products-workspace', () => ({
  ProductsWorkspace: () => <div>ProductsWorkspace</div>,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireProductsPageAccess: requireProductsPageAccessMock,
}));

import ProductsPage from './page';

describe('ProductsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
    requireProductsPageAccessMock.mockResolvedValue({ user: { role: 'admin' } });
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  });

  it('defaults to the legacy products manager', async () => {
    const ui = await ProductsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('ProductsManager')).toBeInTheDocument();
    expect(requireProductsPageAccessMock).toHaveBeenCalledWith('en');
  });

  it('renders the integrated products workspace after opting out of legacy UI', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: '0' }) });

    render(await ProductsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('ProductsWorkspace')).toBeInTheDocument();
    expect(screen.queryByText('ProductsManager')).not.toBeInTheDocument();
  });
});
