import { NextRequest, NextResponse } from 'next/server';

import { requireBulletinSession } from '@/lib/bulletin-server';
import {
  buildDatedObjectKey,
  deletePrivateS3Object,
  ensurePrivateS3Config,
  getS3UploadClient,
  uploadPrivateBufferToS3,
} from '@/lib/s3-upload';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '@/lib/sentry';
import {
  validateAndBufferBulletinUploads,
  validateBulletinRequestLength,
} from '@/lib/upload-validation';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const { session, response } = await requireBulletinSession();
  if (response) {
    return response;
  }

  const uploadedKeys: string[] = [];
  try {
    const requestLengthError = validateBulletinRequestLength(req);
    if (requestLengthError) {
      return NextResponse.json(
        { error: requestLengthError.error },
        { status: requestLengthError.status, headers: withRequestIdHeaders(requestId) },
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: 'Invalid multipart request body' },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }
    const files = formData.getAll('files').filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }

    const validated = await validateAndBufferBulletinUploads(files);
    if (!validated.ok) {
      return NextResponse.json(
        { error: validated.error },
        { status: validated.status, headers: withRequestIdHeaders(requestId) },
      );
    }

    const { region, bucket } = ensurePrivateS3Config();
    const client = getS3UploadClient(region);
    const uploadedFiles: Array<{
      fileName: string;
      fileUrl: string;
      fileKey: string;
      contentType: string;
      size: number;
    }> = [];

    for (const { file, buffer, extension, contentType } of validated.files) {
      const key = buildDatedObjectKey('bulletin', extension);
      await uploadPrivateBufferToS3({
        client,
        bucket,
        key,
        body: buffer,
        contentType,
      });
      uploadedKeys.push(key);
      const fileUrl = `/api/bulletin/attachments/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}?name=${encodeURIComponent(file.name)}`;

      uploadedFiles.push({
        fileName: file.name,
        fileUrl,
        fileKey: key,
        contentType,
        size: file.size,
      });
    }

    return NextResponse.json(
      { files: uploadedFiles },
      { headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => deletePrivateS3Object(key).catch(() => undefined)));
    captureAdminException(error, {
      requestId,
      operation: 'bulletin-upload',
      route: '/api/uploads/bulletin',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500, headers: withRequestIdHeaders(requestId) },
    );
  }
}
