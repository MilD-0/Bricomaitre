import { OrdersManager } from '../../../../components/orders/orders-manager';
import { OrdersWorkspace } from '../../../../components/orders/orders-workspace';
import {
  loadDailyOrderStatusOverview,
  loadOrdersPageData,
} from '../../../../lib/admin-orders-data';
import { getDb, hasDb } from '@bric/db/client';
import { readEcotrackCatalog } from '../../../../lib/ecotrack';
import { requireOrdersPageAccess } from '../../../../lib/page-access';
import { canViewProfitStats } from '../../../../lib/permissions';
import { cookies } from 'next/headers';
import {
  ADMIN_LEGACY_UI_COOKIE,
  parseLegacyUiPreference,
} from '../../../../lib/admin-ui-preference';

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireOrdersPageAccess(locale);
  const cookieStore = await cookies();
  const legacyUi = parseLegacyUiPreference(cookieStore.get(ADMIN_LEGACY_UI_COOKIE)?.value);
  const [initialOrders, initialCatalog, initialOverview] = await Promise.all([
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
    loadDailyOrderStatusOverview({
      includeProfitProjection: canViewProfitStats(session.user.permissions),
      profitProjectionBasis: 'confirmed',
      ...(legacyUi ? {} : { reportDays: 7 }),
    }),
  ]);

  return legacyUi ? (
    <OrdersManager
      initialOrders={initialOrders}
      initialCatalog={initialCatalog}
      initialOverview={initialOverview}
    />
  ) : (
    <OrdersWorkspace
      initialOrders={initialOrders}
      initialCatalog={initialCatalog}
      initialOverview={initialOverview}
    />
  );
}
