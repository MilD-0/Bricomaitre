import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { getActionEntityConfig, loadActionHistoryDetail } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { canMutateResource, requireSettingsAccess } from '../../../../lib/rbac';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAccess();
  if (denied) return denied;

  const actionLogId = parsePositiveIntegerId((await params).id);
  if (actionLogId === null) {
    return NextResponse.json({ error: 'Invalid action log id' }, { status: 400 });
  }
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const detail = await loadActionHistoryDetail(getDb(), actionLogId);
  if (!detail) {
    return NextResponse.json({ error: 'Action log not found' }, { status: 404 });
  }

  const session = await auth();
  const config = getActionEntityConfig(detail.item.entityType);
  const canRecover = config
    ? canMutateResource(session?.user?.permissions, config.resource)
    : false;
  const recovery =
    detail.recovery.nextAction && !canRecover
      ? { nextAction: null, blockedReason: 'permission_required' as const }
      : detail.recovery;

  return NextResponse.json({ item: detail.item, recovery });
}
