import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadOrders, readCatalog, requireAccess } = vi.hoisted(() => ({
  loadOrders: vi.fn(),
  readCatalog: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => ({}), hasDb: () => true }));
vi.mock('../../../../../lib/admin-ecotrack-orders-data', () => ({
  loadEcotrackOrdersPageData: loadOrders,
}));
vi.mock('../../../../../lib/ecotrack', () => ({ readEcotrackCatalog: readCatalog }));
vi.mock('../../../../../lib/page-access', () => ({ requirePageAccess: requireAccess }));
vi.mock('../../../../../components/orders/orders-ecotrack-manager', () => ({
  OrdersEcotrackManager: () => <div>ECOTRACK manager</div>,
}));

import OrdersEcotrackPage from './page';

describe('OrdersEcotrackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOrders.mockResolvedValue({ items: [] });
    readCatalog.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  });

  it('always renders the canonical ECOTRACK workspace', async () => {
    render(await OrdersEcotrackPage({ params: Promise.resolve({ locale: 'en' }) }));
    expect(requireAccess).toHaveBeenCalledWith('en', 'orders');
    expect(screen.getByText('ECOTRACK manager')).toBeInTheDocument();
  });
});
