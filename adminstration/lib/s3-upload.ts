import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const required = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_CLOUDFRONT_DOMAIN'] as const;

export function ensureS3UploadConfig() {
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

export function getS3UploadClient(region: string) {
  return new S3Client({ region });
}

export function buildCloudfrontUrl(cloudfrontDomain: string, key: string) {
  return `https://${cloudfrontDomain}/${key}`;
}

export function buildDatedObjectKey(prefix: string, extension: string, now = new Date()) {
  const safeExtension = extension.replace(/^\.+/, '') || 'bin';
  return `${prefix}/${now.toISOString().slice(0, 10)}/${randomUUID()}.${safeExtension}`;
}

export async function uploadBufferToS3({
  client,
  bucket,
  cloudfrontDomain,
  key,
  body,
  contentType,
}: {
  client: S3Client;
  bucket: string;
  cloudfrontDomain: string;
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return buildCloudfrontUrl(cloudfrontDomain, key);
}
