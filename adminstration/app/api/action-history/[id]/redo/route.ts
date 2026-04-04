import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../../db/client';
import { actionLogs } from '../../../../../db/schema';
import { applyHistoryAction, getActionEntityConfig, toActionHistoryItem } from '../../../../../lib/action-history';
import { auth } from '../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../lib/rbac';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const db = getDb();
  const actionLogId = Number(id);
  const [entry] = await db.select().from(actionLogs).where(eq(actionLogs.id, actionLogId)).limit(1);

  if (!entry) {
    return NextResponse.json({ error: 'Action log not found' }, { status: 404 });
  }

  const config = getActionEntityConfig(entry.entityType);
  if (!config) {
    return NextResponse.json({ error: 'Unsupported entity type' }, { status: 400 });
  }

  const denied = await requireMutationAccess(config.resource);
  if (denied) {
    return denied;
  }

  try {
    const session = await auth();
    const updated = await applyHistoryAction(db, {
      actionLogId,
      direction: 'redo',
      actor: { email: session?.user?.email, name: session?.user?.name },
    });

    return NextResponse.json({ ok: true, item: toActionHistoryItem(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to redo action';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
