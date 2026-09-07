import { NextRequest, NextResponse } from 'next/server';

import {
  ADMIN_STATS_IMPORT_QUEUE,
  getLatestExportJob,
  startStatsImportJob,
} from '@/lib/background-jobs';
import { requireAnalyticsAccess } from '@/lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '@/lib/sentry';
import {
  validateAndBufferSpreadsheetUploads,
  validateSpreadsheetRequestLength,
} from '@/lib/upload-validation';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const { response: denied, session } = await requireAnalyticsAccess();

  if (denied) {
    return denied;
  }

  try {
    return NextResponse.json(
      {
        job: await getLatestExportJob(
          ADMIN_STATS_IMPORT_QUEUE,
          getRequesterKey(session?.user?.email),
        ),
      },
      { headers: withRequestIdHeaders(requestId) },
    );
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
  const { response: denied, session } = await requireAnalyticsAccess();

  if (denied) {
    return denied;
  }

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

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No files uploaded' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const validated = await validateAndBufferSpreadsheetUploads(files);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: validated.status, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const importFiles = validated.files.map(({ file, buffer }) => ({
      fileName: file.name,
      fileBuffer: buffer,
    }));
    const startResult = await startStatsImportJob(
      getRequesterKey(session?.user?.email),
      {
        files: importFiles,
      },
      requestId,
    );

    return NextResponse.json(
      {
        files: validated.files.map(({ file, contentType }, index) => ({
          fileName: file.name,
          fileUrl: `/api/uploads/stats?jobId=${startResult.job.id}`,
          fileKey: `${startResult.job.id}:${index}`,
          contentType,
          size: file.size,
        })),
        job: startResult.job,
      },
      { headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'stats-import-start',
      route: '/api/uploads/stats',
      session,
      context: {
        files: files.map((file) => ({
          fileName: file.name,
          contentType: file.type || null,
          size: file.size,
        })),
      },
    });
    throw error;
  }
}
