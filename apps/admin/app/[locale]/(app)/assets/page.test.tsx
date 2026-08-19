import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadAssetsDataMock,
  loadAssetsMetaDataMock,
  readLegacyUiPreferenceMock,
  requireAssetsPageAccessMock,
} = vi.hoisted(() => ({
  loadAssetsDataMock: vi.fn(),
  loadAssetsMetaDataMock: vi.fn(),
  readLegacyUiPreferenceMock: vi.fn(),
  requireAssetsPageAccessMock: vi.fn(),
}));

vi.mock('../../../../lib/admin-assets-data', () => ({
  loadAssetsData: loadAssetsDataMock,
  loadAssetsMetaData: loadAssetsMetaDataMock,
}));

vi.mock('../../../../components/assets-manager', () => ({
  AssetsManager: () => <div>AssetsManager</div>,
}));
vi.mock('../../../../components/assets/assets-workspace-page', () => ({
  AssetsWorkspacePage: ({ view }: { view: string }) => <div>AssetsWorkspace:{view}</div>,
}));
vi.mock('../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: readLegacyUiPreferenceMock,
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
    readLegacyUiPreferenceMock.mockResolvedValue(true);
  });

  it('renders the dedicated assets manager page', async () => {
    const ui = await AssetsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('AssetsManager')).toBeInTheDocument();
    expect(requireAssetsPageAccessMock).toHaveBeenCalledWith('en');
    expect(loadAssetsDataMock).toHaveBeenCalled();
    expect(loadAssetsMetaDataMock).toHaveBeenCalled();
  });

  it('renders the accepted workspace when Legacy UI is disabled', async () => {
    readLegacyUiPreferenceMock.mockResolvedValue(false);
    render(await AssetsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('AssetsWorkspace:banners')).toBeInTheDocument();
    expect(loadAssetsDataMock).not.toHaveBeenCalled();
    expect(loadAssetsMetaDataMock).not.toHaveBeenCalled();
  });
});
