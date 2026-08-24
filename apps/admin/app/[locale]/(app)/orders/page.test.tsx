import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadOverview, loadOrders, readCatalog, requireAccess } = vi.hoisted(() => ({
  loadOverview: vi.fn(),
  loadOrders: vi.fn(),
  readCatalog: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock('../../../../components/orders/orders-workspace', () => ({
  OrdersWorkspace: () => <div>Orders workspace</div>,
}));
vi.mock('../../../../lib/admin-orders-data', () => ({
  loadDailyOrderStatusOverview: loadOverview,
  loadOrdersPageData: loadOrders,
}));
vi.mock('../../../../lib/ecotrack', () => ({ readEcotrackCatalog: readCatalog }));
vi.mock('@bric/db/client', () => ({ getDb: () => ({}), hasDb: () => true }));
vi.mock('../../../../lib/page-access', () => ({ requireOrdersPageAccess: requireAccess }));

import OrdersPage from './page';

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccess.mockResolvedValue({ user: { permissions: [] } });
    loadOrders.mockResolvedValue({ items: [] });
    loadOverview.mockResolvedValue({ available: false });
    readCatalog.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  });

  it('always renders the canonical orders workspace with its seven-day overview', async () => {
    render(await OrdersPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(requireAccess).toHaveBeenCalledWith('en');
    expect(loadOrders).toHaveBeenCalledWith(
      { page: 1, limit: 25, search: '', sortKey: 'createdAt', sortDirection: 'desc' },
      true,
    );
    expect(loadOverview).toHaveBeenCalledWith({
      includeProfitProjection: false,
      profitProjectionBasis: 'confirmed',
      reportDays: 7,
    });
    expect(screen.getByText('Orders workspace')).toBeInTheDocument();
  });
});
