import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadDailyOrderStatusOverviewMock,
  loadOrdersPageDataMock,
  readEcotrackCatalogMock,
  getDbMock,
  hasDbMock,
  requireOrdersPageAccessMock,
  cookiesMock,
} = vi.hoisted(() => ({
  loadDailyOrderStatusOverviewMock: vi.fn(),
  loadOrdersPageDataMock: vi.fn(),
  readEcotrackCatalogMock: vi.fn(),
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireOrdersPageAccessMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock('../../../../components/orders/orders-manager', () => ({
  OrdersManager: () => <div>OrdersManager</div>,
}));

vi.mock('../../../../components/orders/orders-workspace', () => ({
  OrdersWorkspace: () => <div>OrdersWorkspace</div>,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('../../../../lib/admin-orders-data', () => ({
  loadDailyOrderStatusOverview: loadDailyOrderStatusOverviewMock,
  loadOrdersPageData: loadOrdersPageDataMock,
}));

vi.mock('../../../../lib/ecotrack', () => ({
  readEcotrackCatalog: readEcotrackCatalogMock,
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireOrdersPageAccess: requireOrdersPageAccessMock,
}));

import OrdersPage from './page';

describe('OrdersPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    requireOrdersPageAccessMock.mockResolvedValue({
      user: {
        role: 'employee',
      },
    });
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({});
    loadOrdersPageDataMock.mockResolvedValue({
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
    loadDailyOrderStatusOverviewMock.mockResolvedValue({
      available: false,
      reportDay: null,
      timezone: 'Africa/Algiers',
    });
    readEcotrackCatalogMock.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  });

  it('defaults to the legacy orders manager', async () => {
    const ui = await OrdersPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('OrdersManager')).toBeInTheDocument();
    expect(requireOrdersPageAccessMock).toHaveBeenCalledWith('en');
    expect(loadOrdersPageDataMock).toHaveBeenCalledWith(
      { page: 1, limit: 25, search: '', sortKey: 'createdAt', sortDirection: 'desc' },
      true,
    );
    expect(loadDailyOrderStatusOverviewMock).toHaveBeenCalledWith({
      includeProfitProjection: false,
      profitProjectionBasis: 'confirmed',
    });
  });

  it('renders the integrated orders workspace with its seven-day overview', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: '0' }) });

    render(await OrdersPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('OrdersWorkspace')).toBeInTheDocument();
    expect(screen.queryByText('OrdersManager')).not.toBeInTheDocument();
    expect(loadDailyOrderStatusOverviewMock).toHaveBeenCalledWith({
      includeProfitProjection: false,
      profitProjectionBasis: 'confirmed',
      reportDays: 7,
    });
  });
});
