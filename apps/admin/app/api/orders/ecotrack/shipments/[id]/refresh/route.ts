import { NextRequest } from 'next/server';

import { refreshEcotrackOrder } from '@/lib/admin-ecotrack-orders-data';
import { handleEcotrackShipmentMutation } from '@/lib/ecotrack-route-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleEcotrackShipmentMutation({
    request,
    params,
    operation: 'ecotrack-shipment-refresh',
    route: '/api/orders/ecotrack/shipments/[id]/refresh',
    fallbackError: 'Unable to refresh ECOTRACK shipment.',
    action: (orderId, _payload, actor) => refreshEcotrackOrder(orderId, actor),
  });
}
