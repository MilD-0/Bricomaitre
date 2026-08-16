import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadAssetsDataMock, loadAssetsMetaDataMock, requireAssetsPageAccessMock } = vi.hoisted(
  () => ({
    loadAssetsDataMock: vi.fn(),
    loadAssetsMetaDataMock: vi.fn(),
    requireAssetsPageAccessMock: vi.fn(),
  }),
);

vi.mock('../../../../lib/admin-assets-data', () => ({
  loadAssetsData: loadAssetsDataMock,
  loadAssetsMetaData: loadAssetsMetaDataMock,
}));

vi.mock('../../../../components/assets-manager', () => ({
  AssetsManager: () => <div>AssetsManager</div>,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireAssetsPageAccess: requireAssetsPageAccessMock,
}));

import AssetsPage from './page';

describe('AssetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAssetsDataMock.mockResolvedValue({ banners: [], featuredGroups: [], productCards: [] });
    loadAssetsMetaDataMock.mockResolvedValue({ products: [], brands: [], categories: [] });
  });

  it('renders the dedicated assets manager page', async () => {
    const ui = await AssetsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('AssetsManager')).toBeInTheDocument();
    expect(requireAssetsPageAccessMock).toHaveBeenCalledWith('en');
    expect(loadAssetsDataMock).toHaveBeenCalled();
    expect(loadAssetsMetaDataMock).toHaveBeenCalled();
  });
});
