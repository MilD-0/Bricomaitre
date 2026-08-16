import { NextRequest } from 'next/server';

import { requestEcotrackReturn } from '../../../../../../../lib/admin-ecotrack-orders-data';
import { handleEcotrackShipmentMutation } from '../../../../../../../lib/ecotrack-route-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleEcotrackShipmentMutation({
    request,
    params,
    operation: 'ecotrack-shipment-return',
    route: '/api/orders/ecotrack/shipments/[id]/return',
    fallbackError: 'Unable to request the ECOTRACK return.',
    action: (orderId, _payload, actor) => requestEcotrackReturn(orderId, actor),
  });
}
