import { hasDb } from '@bric/db/client';
import { NextRequest, NextResponse } from 'next/server';
import { EcotrackMutationConflictError } from '@/lib/ecotrack-mutations';
import {
  ecotrackRecoveryRequestSchema,
  listEcotrackRecoveries,
  recoverEcotrackMutation,
} from '@/lib/ecotrack-recovery';
import { requireMutationAccess } from '@/lib/rbac';
import { captureAdminException, getRequestId } from '@/lib/sentry';

export async function GET() {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  return NextResponse.json({ items: await listEcotrackRecoveries() });
}

export async function POST(request: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = ecotrackRecoveryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    await recoverEcotrackMutation(parsed.data, {
      email: session?.user?.email,
      name: session?.user?.name,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    captureAdminException(error, {
      requestId: getRequestId(request),
      operation: 'carrier-recovery',
      route: '/api/orders/ecotrack/recovery',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Carrier recovery failed.' },
      { status: error instanceof EcotrackMutationConflictError ? 409 : 502 },
    );
  }
}
