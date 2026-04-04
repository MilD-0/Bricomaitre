import { NextResponse } from 'next/server';

import { auth } from '../../../../lib/auth';
import { ADMIN_ECOTRACK_SYNC_QUEUE, getLatestExportJob, startEcotrackSyncJob } from '../../../../lib/background-jobs';
import { requireOpsAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const denied = await requireOpsAccess();
  if (denied) return denied;

  const session = await auth();
  try {
    return NextResponse.json({
      job: await getLatestExportJob(ADMIN_ECOTRACK_SYNC_QUEUE, getRequesterKey(session?.user?.email)),
    }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-sync-status',
      route: '/api/ecotrack/sync',
      session,
    });
    throw error;
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const denied = await requireOpsAccess();
  if (denied) return denied;

  const session = await auth();
  try {
    const result = await startEcotrackSyncJob(getRequesterKey(session?.user?.email), 'manual', requestId);

    if (result.kind === 'busy') {
      return NextResponse.json({ error: 'Ecotrack sync is already running.', job: result.job }, { status: 429, headers: withRequestIdHeaders(requestId) });
    }

    return NextResponse.json({ job: result.job }, { status: result.kind === 'started' ? 201 : 200, headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-sync-start',
      route: '/api/ecotrack/sync',
      session,
      context: { trigger: 'manual' },
    });
    throw error;
  }
}
