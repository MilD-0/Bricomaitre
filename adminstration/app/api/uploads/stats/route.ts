import { NextRequest, NextResponse } from 'next/server';

import { auth } from '../../../../lib/auth';
import { ADMIN_STATS_IMPORT_QUEUE, getLatestExportJob, startStatsImportJob } from '../../../../lib/background-jobs';
import { requireOpsAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  const session = await auth();
  try {
    return NextResponse.json({
      job: await getLatestExportJob(ADMIN_STATS_IMPORT_QUEUE, getRequesterKey(session?.user?.email)),
    }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'stats-import-status',
      route: '/api/uploads/stats',
      session,
    });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  const formData = await request.formData();
  const file = formData.getAll('files').find((entry): entry is File => entry instanceof File);

  if (!file) {
    return NextResponse.json({ error: 'No files uploaded' }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  const session = await auth();
  try {
    const startResult = await startStatsImportJob(getRequesterKey(session?.user?.email), {
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
    }, requestId);

    return NextResponse.json({
      files: [
        {
          fileName: file.name,
          fileUrl: `/api/uploads/stats?jobId=${startResult.job.id}`,
          fileKey: startResult.job.id,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        },
      ],
      job: startResult.job,
    }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'stats-import-start',
      route: '/api/uploads/stats',
      session,
      context: {
        fileName: file.name,
        contentType: file.type || null,
        size: file.size,
      },
    });
    throw error;
  }
}
