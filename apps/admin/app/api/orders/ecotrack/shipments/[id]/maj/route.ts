import { NextRequest } from 'next/server';

import {
  addEcotrackMaj,
  parseEcotrackMajCreateRequest,
} from '../../../../../../../lib/admin-ecotrack-orders-data';
import { handleEcotrackShipmentMutation } from '../../../../../../../lib/ecotrack-route-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleEcotrackShipmentMutation({
    request,
    params,
    operation: 'ecotrack-shipment-maj',
    route: '/api/orders/ecotrack/shipments/[id]/maj',
    fallbackError: 'Unable to add ECOTRACK update.',
    parseBody: parseEcotrackMajCreateRequest,
    action: (orderId, payload, actor) => addEcotrackMaj(orderId, payload.content, actor),
  });
}
