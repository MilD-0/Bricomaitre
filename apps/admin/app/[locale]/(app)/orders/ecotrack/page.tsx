import { OrdersEcotrackManager } from '../../../../../components/orders/orders-ecotrack-manager';
import { getDb, hasDb } from '@bric/db/client';
import { loadEcotrackOrdersPageData } from '../../../../../lib/admin-ecotrack-orders-data';
import { readEcotrackCatalog } from '../../../../../lib/ecotrack';
import { requirePageAccess } from '../../../../../lib/page-access';

export default async function OrdersEcotrackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requirePageAccess(locale, 'orders');

  const [initialOrders, initialCatalog] = await Promise.all([
    loadEcotrackOrdersPageData(
      {
        page: 1,
        limit: 25,
        search: '',
        status: 'all',
        staleOnly: false,
        sortKey: 'createdAt',
        sortDirection: 'desc',
      },
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

  return <OrdersEcotrackManager initialOrders={initialOrders} initialCatalog={initialCatalog} />;
}
