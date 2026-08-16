import { NextRequest } from 'next/server';

import {
  dispatchPostedEcotrackOrder,
  parseEcotrackDispatchRequest,
} from '../../../../../../../lib/admin-ecotrack-orders-data';
import { handleEcotrackShipmentMutation } from '../../../../../../../lib/ecotrack-route-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleEcotrackShipmentMutation({
    request,
    params,
    operation: 'ecotrack-shipment-dispatch',
    route: '/api/orders/ecotrack/shipments/[id]/dispatch',
    fallbackError: 'Unable to dispatch ECOTRACK shipment.',
    parseBody: parseEcotrackDispatchRequest,
    action: dispatchPostedEcotrackOrder,
  });
}
