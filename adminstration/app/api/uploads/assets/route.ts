import { NextRequest, NextResponse } from 'next/server';

import { auth } from '../../../../lib/auth';
import { requireMutationAccess } from '../../../../lib/rbac';
import {
  buildDatedObjectKey,
  ensureS3UploadConfig,
  getS3UploadClient,
  uploadBufferToS3,
} from '../../../../lib/s3-upload';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }
  const session = await auth();

  try {
    const { region, bucket, cloudfrontDomain } = ensureS3UploadConfig();
    const formData = await req.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400, headers: withRequestIdHeaders(requestId) });
    }

    const client = getS3UploadClient(region);
    const urls: string[] = [];

    for (const file of files) {
      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const key = buildDatedObjectKey('assets', extension ?? 'bin');
      const body = Buffer.from(await file.arrayBuffer());
      urls.push(await uploadBufferToS3({
        client,
        bucket,
        cloudfrontDomain,
        key,
        body,
        contentType: file.type || 'application/octet-stream',
      }));
    }

    return NextResponse.json({ urls }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'assets-upload',
      route: '/api/uploads/assets',
      session,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: withRequestIdHeaders(requestId) });
  }
}
