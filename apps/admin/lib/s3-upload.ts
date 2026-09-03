import { randomUUID } from 'crypto';
import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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

export function ensurePrivateS3Config() {
  const requiredPrivate = ['AWS_REGION', 'AWS_S3_BUCKET'] as const;
  const missing = requiredPrivate.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    region: process.env.AWS_REGION as string,
    bucket: process.env.AWS_S3_BUCKET as string,
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

export async function uploadPrivateBufferToS3({
  client,
  bucket,
  key,
  body,
  contentType,
  expiresAt,
}: {
  client: S3Client;
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  expiresAt?: Date;
}) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      ServerSideEncryption: 'AES256',
      ...(expiresAt ? { Expires: expiresAt } : {}),
    }),
  );
  return key;
}

export async function readPrivateS3Object(key: string) {
  const { region, bucket } = ensurePrivateS3Config();
  return getS3UploadClient(region).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export function isS3ObjectNotFound(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export async function deletePrivateS3Object(key: string) {
  const { region, bucket } = ensurePrivateS3Config();
  await getS3UploadClient(region).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteExpiredPrivateS3Objects({
  prefix,
  cutoff,
  client: providedClient,
  bucket: providedBucket,
}: {
  prefix: string;
  cutoff: Date;
  client?: S3Client;
  bucket?: string;
}) {
  let client = providedClient;
  let bucket = providedBucket;
  if (!client || !bucket) {
    const config = ensurePrivateS3Config();
    client = getS3UploadClient(config.region);
    bucket = config.bucket;
  }

  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1_000,
    }),
  );
  const expiredKeys = (listed.Contents ?? [])
    .filter(
      (object): object is typeof object & { Key: string } =>
        Boolean(object.Key) && Boolean(object.LastModified) && object.LastModified! <= cutoff,
    )
    .map((object) => object.Key);
  if (expiredKeys.length === 0) return 0;

  const deletion = await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: expiredKeys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
  if (deletion.Errors?.length) {
    throw new Error(`Failed to delete ${deletion.Errors.length} expired private S3 object(s).`);
  }
  return expiredKeys.length;
}
