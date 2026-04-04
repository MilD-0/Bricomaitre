import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { auth } from '../../../../lib/auth';
import { requireMutationAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

const required = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_CLOUDFRONT_DOMAIN'] as const;

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
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }
  const session = await auth();

  try {
    const { region, bucket, cloudfrontDomain } = ensureConfig();
    const formData = await req.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400, headers: withRequestIdHeaders(requestId) });
    }

    const client = getClient(region);
    const urls: string[] = [];

    for (const file of files) {
      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const key = `categories/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
      const body = Buffer.from(await file.arrayBuffer());

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: file.type || 'application/octet-stream',
        }),
      );

      urls.push(`https://${cloudfrontDomain}/${key}`);
    }

    return NextResponse.json({ urls }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'categories-upload',
      route: '/api/uploads/categories',
      session,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: withRequestIdHeaders(requestId) });
  }
}
