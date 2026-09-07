import { NextRequest } from 'next/server';

import {
  parseEcotrackShipmentUpdateDraft,
  recreatePostedEcotrackOrder,
} from '@/lib/admin-ecotrack-orders-data';
import { handleEcotrackShipmentMutation } from '@/lib/ecotrack-route-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleEcotrackShipmentMutation({
    request,
    params,
    operation: 'ecotrack-shipment-recreate',
    route: '/api/orders/ecotrack/shipments/[id]/recreate',
    fallbackError: 'Unable to recreate ECOTRACK shipment.',
    parseBody: parseEcotrackShipmentUpdateDraft,
    action: recreatePostedEcotrackOrder,
  });
}
