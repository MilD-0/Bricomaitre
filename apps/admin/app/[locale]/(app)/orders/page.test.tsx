import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadOrders, readCatalog, requireAccess, workspaceProps } = vi.hoisted(() => ({
  loadOrders: vi.fn(),
  readCatalog: vi.fn(),
  requireAccess: vi.fn(),
  workspaceProps: vi.fn(),
}));

vi.mock('../../../../components/orders/orders-workspace', () => ({
  OrdersWorkspace: (props: unknown) => {
    workspaceProps(props);
    return <div>Orders workspace</div>;
  },
}));
vi.mock('../../../../lib/admin-orders-data', () => ({
  loadOrdersPageData: loadOrders,
}));
vi.mock('../../../../lib/ecotrack', () => ({ readEcotrackCatalog: readCatalog }));
vi.mock('@bric/db/client', () => ({ getDb: () => ({}), hasDb: () => true }));
vi.mock('../../../../lib/page-access', () => ({ requirePageAccess: requireAccess }));

import OrdersPage from './page';

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccess.mockResolvedValue({ user: { permissions: [] } });
    loadOrders.mockResolvedValue({ items: [] });
    readCatalog.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  });

  it('renders orders and catalog without blocking on the operational overview', async () => {
    render(await OrdersPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(requireAccess).toHaveBeenCalledWith('en', 'orders');
    expect(loadOrders).toHaveBeenCalledWith(
      { page: 1, limit: 25, search: '', sortKey: 'createdAt', sortDirection: 'desc' },
      true,
    );
    expect(workspaceProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOrders: { items: [] },
        initialCatalog: expect.objectContaining({ wilayas: [] }),
      }),
    );
    expect(workspaceProps.mock.calls[0]?.[0]).not.toHaveProperty('initialOverview');
    expect(screen.getByText('Orders workspace')).toBeInTheDocument();
  });
});
