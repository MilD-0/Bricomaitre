import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { actionLogs } from '@bric/db/schema';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  ActionHistoryConflictError,
  applyHistoryAction,
  getActionEntityConfig,
  toActionHistoryItem,
} from './action-history';
import { refreshActionHistoryConsumers } from './action-history-effects';
import { auth } from './auth';
import { canMutateResource } from './rbac';

export async function recoverActionHistory(id: string, direction: 'undo' | 'redo') {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isAllowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const actionLogId = parsePositiveIntegerId(id);
  if (actionLogId === null)
    return NextResponse.json({ error: 'Invalid action log id' }, { status: 400 });
  const db = getDb();
  const [entry] = await db
    .select({ entityType: actionLogs.entityType, isReversible: actionLogs.isReversible })
    .from(actionLogs)
    .where(eq(actionLogs.id, actionLogId))
    .limit(1);
  if (!entry) return NextResponse.json({ error: 'Action log not found' }, { status: 404 });
  const config = getActionEntityConfig(entry.entityType);
  if (!config) return NextResponse.json({ error: 'Unsupported entity type' }, { status: 400 });
  if (!canMutateResource(session.user.permissions, config.resource)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!entry.isReversible) {
    return NextResponse.json(
      { error: `This action cannot be ${direction === 'undo' ? 'undone' : 'redone'}.` },
      { status: 409 },
    );
  }
  try {
    const updated = await applyHistoryAction(db, {
      actionLogId,
      direction,
      actor: { email: session.user.email, name: session.user.name },
    });
    await refreshActionHistoryConsumers(config.resource);
    return NextResponse.json({ ok: true, item: toActionHistoryItem(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `Unable to ${direction} action` },
      { status: error instanceof ActionHistoryConflictError ? 409 : 500 },
    );
  }
}
