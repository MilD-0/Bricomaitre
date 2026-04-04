import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';

import { requireBulletinSession } from '../../../../lib/bulletin-server';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

const required = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_CLOUDFRONT_DOMAIN'] as const;
const maxFileSize = 100 * 1024 * 1024;

function ensureConfig() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return {
    region: process.env.AWS_REGION as string,
    bucket: process.env.AWS_S3_BUCKET as string,
    cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN as string,
  };
}

function getClient(region: string) {
  return new S3Client({ region });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const { session, response } = await requireBulletinSession();
  if (response) {
    return response;
  }

  try {
    const { region, bucket, cloudfrontDomain } = ensureConfig();
    const formData = await req.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400, headers: withRequestIdHeaders(requestId) });
    }

    const client = getClient(region);
    const uploadedFiles: Array<{
      fileName: string;
      fileUrl: string;
      fileKey: string;
      contentType: string;
      size: number;
    }> = [];

    for (const file of files) {
      if (file.size > maxFileSize) {
        return NextResponse.json({ error: `File "${file.name}" exceeds the 100MB limit` }, { status: 400 });
      }

      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const key = `bulletin/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
      const body = Readable.fromWeb(file.stream() as any);

      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: file.type || 'application/octet-stream',
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024,
      });

      await upload.done();

      uploadedFiles.push({
        fileName: file.name,
        fileUrl: `https://${cloudfrontDomain}/${key}`,
        fileKey: key,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    return NextResponse.json({ files: uploadedFiles }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'bulletin-upload',
      route: '/api/uploads/bulletin',
      session,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: withRequestIdHeaders(requestId) });
  }
}
