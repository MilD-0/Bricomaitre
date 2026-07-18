import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { aiProposals, aiRuns } from '../../../../db/schema';
import { auth } from '../../../../lib/auth';
import { ADMIN_AI_CONTENT_QUEUE, getLatestExportJob } from '../../../../lib/background-jobs';
import { requireAiUseAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireAiUseAccess();
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const session = await auth();
  const owner = session?.user?.email ?? 'unknown-admin';
  const db = getDb();
  const [proposals, runs, job] = await Promise.all([
    db.select({ id: aiProposals.id, type: aiProposals.proposalType, status: aiProposals.status, entityType: aiProposals.entityType, entityId: aiProposals.entityId, reasoning: aiProposals.reasoning, payload: aiProposals.payload, createdAt: aiProposals.createdAt }).from(aiProposals).where(eq(aiProposals.requestedBy, owner)).orderBy(desc(aiProposals.createdAt)).limit(30),
    db.select({ id: aiRuns.id, task: aiRuns.task, status: aiRuns.status, startedAt: aiRuns.startedAt, completedAt: aiRuns.completedAt, errorCode: aiRuns.errorCode }).from(aiRuns).where(and(eq(aiRuns.actorId, owner), eq(aiRuns.surface, 'admin'))).orderBy(desc(aiRuns.startedAt)).limit(30),
    getLatestExportJob(ADMIN_AI_CONTENT_QUEUE, owner),
  ]);
  return NextResponse.json({ proposals, runs, jobs: job ? [job] : [] });
}
