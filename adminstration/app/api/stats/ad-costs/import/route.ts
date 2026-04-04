import { NextRequest, NextResponse } from 'next/server';

import { auth } from '../../../../../lib/auth';
import { ADMIN_AD_COST_IMPORT_QUEUE, getLatestExportJob, startAdCostsImportJob } from '../../../../../lib/background-jobs';
import { requireOpsAccess } from '../../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../../lib/sentry';

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
      job: await getLatestExportJob(ADMIN_AD_COST_IMPORT_QUEUE, getRequesterKey(session?.user?.email)),
    }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ad-cost-import-status',
      route: '/api/stats/ad-costs/import',
      session,
    });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const denied = await requireOpsAccess();
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.getAll('files').find((entry): entry is File => entry instanceof File) ?? formData.get('file');
  const rate = Number.parseFloat(String(formData.get('rate') ?? '230'));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  const session = await auth();
  const normalizedRate = Number.isFinite(rate) ? rate : 230;
  try {
    const startResult = await startAdCostsImportJob(getRequesterKey(session?.user?.email), {
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      rate: normalizedRate,
      actor: { email: session?.user?.email, name: session?.user?.name },
    }, requestId);
    return NextResponse.json({
      files: [
        {
          fileName: file.name,
          fileUrl: `/api/stats/ad-costs/import?jobId=${startResult.job.id}`,
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
      operation: 'ad-cost-import-start',
      route: '/api/stats/ad-costs/import',
      session,
      context: {
        fileName: file.name,
        contentType: file.type || null,
        size: file.size,
        rate: normalizedRate,
      },
    });
    throw error;
  }
}
