import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listLandingPagesMock, loadAssetsMetaDataMock, requireAssetsPageAccessMock } = vi.hoisted(() => ({
  listLandingPagesMock: vi.fn(),
  loadAssetsMetaDataMock: vi.fn(),
  requireAssetsPageAccessMock: vi.fn(),
}));
const { getStorefrontNewBaseUrlMock } = vi.hoisted(() => ({ getStorefrontNewBaseUrlMock: vi.fn() }));

vi.mock('../../../../lib/landing-pages', () => ({ listLandingPages: listLandingPagesMock }));
vi.mock('../../../../lib/admin-assets-data', () => ({ loadAssetsMetaData: loadAssetsMetaDataMock }));
vi.mock('../../../../lib/page-access', () => ({ requireAssetsPageAccess: requireAssetsPageAccessMock }));
vi.mock('../../../../lib/storefront-revalidate', () => ({ getStorefrontNewBaseUrl: getStorefrontNewBaseUrlMock }));
vi.mock('../../../../components/landing-page-manager', () => ({
  LandingPageManager: ({ initialItems, products, storefrontBaseUrl }: { initialItems: unknown[]; products: unknown[]; storefrontBaseUrl: string | null }) => <div>LandingPageManager:{initialItems.length}:{products.length}:{storefrontBaseUrl}</div>,
}));

import LandingPagesPage from './page';

describe('LandingPagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLandingPagesMock.mockResolvedValue([{ id: 1 }]);
    loadAssetsMetaDataMock.mockResolvedValue({ products: [{ id: 7 }], brands: [], categories: [] });
    getStorefrontNewBaseUrlMock.mockReturnValue('https://shop.example.com');
  });

  it('loads the dedicated landing page manager under assets access', async () => {
    render(await LandingPagesPage({ params: Promise.resolve({ locale: 'fr' }) }));
    expect(screen.getByText('LandingPageManager:1:1:https://shop.example.com')).toBeInTheDocument();
    expect(requireAssetsPageAccessMock).toHaveBeenCalledWith('fr');
    expect(listLandingPagesMock).toHaveBeenCalledOnce();
    expect(loadAssetsMetaDataMock).toHaveBeenCalledOnce();
  });
});
