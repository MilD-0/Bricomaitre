import { NextResponse } from 'next/server';

import { buildHealthPayload, getStorefrontHealth } from '../../../lib/health';

export async function GET() {
  const health = await getStorefrontHealth();
  return NextResponse.json(buildHealthPayload(health.ok), { status: health.ok ? 200 : 503 });
}
