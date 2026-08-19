import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, readLegacyUiPreferenceMock, requireBrandsCategoriesPageAccessMock } =
  vi.hoisted(() => ({
    getTranslationsMock: vi.fn(),
    readLegacyUiPreferenceMock: vi.fn(),
    requireBrandsCategoriesPageAccessMock: vi.fn(),
  }));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../components/brands-categories/categories-manager', () => ({
  CategoriesManager: () => <div>CategoriesManager</div>,
}));
vi.mock('../../../../components/brands-categories/taxonomy-workspace', () => ({
  TaxonomyWorkspace: ({ view }: { view: string }) => <div>TaxonomyWorkspace:{view}</div>,
}));
vi.mock('../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: readLegacyUiPreferenceMock,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireBrandsCategoriesPageAccess: requireBrandsCategoriesPageAccessMock,
}));

import CategoriesPage from './page';

describe('CategoriesPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
    readLegacyUiPreferenceMock.mockResolvedValue(true);
  });

  it('renders the dedicated categories manager page', async () => {
    const ui = await CategoriesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('CategoriesManager')).toBeInTheDocument();
    expect(requireBrandsCategoriesPageAccessMock).toHaveBeenCalledWith('en');
  });

  it('renders the accepted categories workspace when Legacy UI is disabled', async () => {
    readLegacyUiPreferenceMock.mockResolvedValue(false);

    render(await CategoriesPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('TaxonomyWorkspace:categories')).toBeInTheDocument();
    expect(screen.queryByText('CategoriesManager')).not.toBeInTheDocument();
  });
});
