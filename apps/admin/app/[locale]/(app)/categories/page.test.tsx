import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, requireBrandsCategoriesPageAccessMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  requireBrandsCategoriesPageAccessMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../components/brands-categories/categories-manager', () => ({
  CategoriesManager: () => <div>CategoriesManager</div>,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireBrandsCategoriesPageAccess: requireBrandsCategoriesPageAccessMock,
}));

import CategoriesPage from './page';

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
  });

  it('renders the dedicated categories manager page', async () => {
    const ui = await CategoriesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('CategoriesManager')).toBeInTheDocument();
    expect(requireBrandsCategoriesPageAccessMock).toHaveBeenCalledWith('en');
  });
});
