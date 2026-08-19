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

vi.mock('../../../../components/brands-categories/brands-manager', () => ({
  BrandsManager: () => <div>BrandsManager</div>,
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

import BrandsPage from './page';

describe('BrandsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
    readLegacyUiPreferenceMock.mockResolvedValue(true);
  });

  it('renders the dedicated brands manager page', async () => {
    const ui = await BrandsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('BrandsManager')).toBeInTheDocument();
    expect(requireBrandsCategoriesPageAccessMock).toHaveBeenCalledWith('en');
  });

  it('renders the accepted brands workspace when Legacy UI is disabled', async () => {
    readLegacyUiPreferenceMock.mockResolvedValue(false);

    render(await BrandsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('TaxonomyWorkspace:brands')).toBeInTheDocument();
    expect(screen.queryByText('BrandsManager')).not.toBeInTheDocument();
  });
});
