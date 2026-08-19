import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDbMock,
  hasDbMock,
  loadEcotrackOrdersPageDataMock,
  readEcotrackCatalogMock,
  readLegacyUiPreferenceMock,
  requireOrdersPageAccessMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  loadEcotrackOrdersPageDataMock: vi.fn(),
  readEcotrackCatalogMock: vi.fn(),
  readLegacyUiPreferenceMock: vi.fn(),
  requireOrdersPageAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('../../../../../lib/admin-ecotrack-orders-data', () => ({
  loadEcotrackOrdersPageData: loadEcotrackOrdersPageDataMock,
}));
vi.mock('../../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: readLegacyUiPreferenceMock,
}));
vi.mock('../../../../../lib/ecotrack', () => ({
  readEcotrackCatalog: readEcotrackCatalogMock,
}));
vi.mock('../../../../../lib/page-access', () => ({
  requireOrdersPageAccess: requireOrdersPageAccessMock,
}));
vi.mock('../../../../../components/orders/orders-ecotrack-manager', () => ({
  OrdersEcotrackManager: ({ presentation }: { presentation?: number }) => (
    <div>{presentation === 2 ? 'Refined ECOTRACK workspace' : 'Legacy ECOTRACK workspace'}</div>
  ),
}));

import OrdersEcotrackPage from './page';

describe('OrdersEcotrackPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({});
    requireOrdersPageAccessMock.mockResolvedValue({ user: { role: 'employee' } });
    readLegacyUiPreferenceMock.mockResolvedValue(true);
    loadEcotrackOrdersPageDataMock.mockResolvedValue({
      writable: true,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    readEcotrackCatalogMock.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  });

  it('preserves the original ECOTRACK manager when Legacy UI is enabled', async () => {
    render(await OrdersEcotrackPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('Legacy ECOTRACK workspace')).toBeInTheDocument();
    expect(requireOrdersPageAccessMock).toHaveBeenCalledWith('en');
    expect(loadEcotrackOrdersPageDataMock).toHaveBeenCalled();
  });

  it('promotes the accepted refined workspace when Legacy UI is disabled', async () => {
    readLegacyUiPreferenceMock.mockResolvedValue(false);

    render(await OrdersEcotrackPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('Refined ECOTRACK workspace')).toBeInTheDocument();
    expect(screen.queryByText('Legacy ECOTRACK workspace')).not.toBeInTheDocument();
  });
});
