import { NextRequest, NextResponse } from 'next/server';

import { auth } from '../../../../../lib/auth';
import {
  ADMIN_AD_COST_IMPORT_QUEUE,
  getLatestExportJob,
  startAdCostsImportJob,
} from '../../../../../lib/background-jobs';
import { requireAnalyticsAccess } from '../../../../../lib/rbac';
import {
  captureAdminException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../../lib/sentry';
import {
  validateAndBufferSpreadsheetUploads,
  validateSpreadsheetRequestLength,
} from '../../../../../lib/upload-validation';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  const session = await auth();
  try {
    return NextResponse.json(
      {
        job: await getLatestExportJob(
          ADMIN_AD_COST_IMPORT_QUEUE,
          getRequesterKey(session?.user?.email),
        ),
      },
      { headers: withRequestIdHeaders(requestId) },
    );
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
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  const requestLengthError = validateSpreadsheetRequestLength(request);
  if (requestLengthError) {
    return NextResponse.json(
      { error: requestLengthError.error },
      { status: requestLengthError.status, headers: withRequestIdHeaders(requestId) },
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: 'Invalid multipart request body' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  const singularFile = formData.get('file');
  if (singularFile instanceof File) files.push(singularFile);

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No file provided' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const validated = await validateAndBufferSpreadsheetUploads(files, 1);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: validated.status, headers: withRequestIdHeaders(requestId) },
    );
  }
  const [{ file, buffer, contentType }] = validated.files;

  const rawRate = String(formData.get('rate') ?? '230').trim();
  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100_000) {
    return NextResponse.json(
      { error: 'rate must be a positive number no greater than 100000' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const session = await auth();
  try {
    const startResult = await startAdCostsImportJob(
      getRequesterKey(session?.user?.email),
      {
        fileName: file.name,
        fileBuffer: buffer,
        rate,
        actor: { email: session?.user?.email, name: session?.user?.name },
      },
      requestId,
    );
    return NextResponse.json(
      {
        files: [
          {
            fileName: file.name,
            fileUrl: `/api/stats/ad-costs/import?jobId=${startResult.job.id}`,
            fileKey: startResult.job.id,
            contentType,
            size: file.size,
          },
        ],
        job: startResult.job,
      },
      { headers: withRequestIdHeaders(requestId) },
    );
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
        rate,
      },
    });
    throw error;
  }
}
