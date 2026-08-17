import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, requireBrandsCategoriesPageAccessMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  requireBrandsCategoriesPageAccessMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../components/brands-categories/brands-manager', () => ({
  BrandsManager: () => <div>BrandsManager</div>,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireBrandsCategoriesPageAccess: requireBrandsCategoriesPageAccessMock,
}));

import BrandsPage from './page';

describe('BrandsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
  });

  it('renders the dedicated brands manager page', async () => {
    const ui = await BrandsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('BrandsManager')).toBeInTheDocument();
    expect(requireBrandsCategoriesPageAccessMock).toHaveBeenCalledWith('en');
  });
});
