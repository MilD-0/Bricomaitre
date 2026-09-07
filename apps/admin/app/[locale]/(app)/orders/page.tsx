import { OrdersWorkspace } from '../../../../components/orders/orders-workspace';
import { loadOrdersPageData } from '../../../../lib/admin-orders-data';
import { getDb, hasDb } from '@bric/db/client';
import { readEcotrackCatalog } from '../../../../lib/ecotrack';
import { requirePageAccess } from '../../../../lib/page-access';

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requirePageAccess(locale, 'orders');
  const [initialOrders, initialCatalog] = await Promise.all([
    loadOrdersPageData(
      { page: 1, limit: 25, search: '', sortKey: 'createdAt', sortDirection: 'desc' },
      true,
    ),
    hasDb()
      ? readEcotrackCatalog(getDb()).then((catalog) => ({
          wilayas: catalog.wilayas,
          communes: catalog.communes,
          serviceFees: catalog.serviceFees,
          weightFees: catalog.weightFees,
          lastSync: catalog.lastSync,
        }))
      : Promise.resolve(undefined),
  ]);

  return (
    <OrdersWorkspace
      operatorId={session?.user.id}
      initialOrders={initialOrders}
      initialCatalog={initialCatalog}
    />
  );
}
