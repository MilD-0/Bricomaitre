import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, requireProductsPageAccessMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  requireProductsPageAccessMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../components/products-manager', () => ({
  ProductsManager: () => <div>ProductsManager</div>,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireProductsPageAccess: requireProductsPageAccessMock,
}));

import ProductsPage from './page';

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
    requireProductsPageAccessMock.mockResolvedValue({ user: { role: 'admin' } });
  });

  it('renders the dedicated products manager page', async () => {
    const ui = await ProductsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('ProductsManager')).toBeInTheDocument();
    expect(requireProductsPageAccessMock).toHaveBeenCalledWith('en');
  });
});
