import { createHash } from 'crypto';

import {
  buildCloudfrontUrl,
  buildDatedObjectKey,
  ensureS3UploadConfig,
  ensurePrivateS3Config,
  getS3UploadClient,
  uploadBufferToS3,
  uploadPrivateBufferToS3,
} from './s3-upload';

export async function uploadExportArtifact(options: {
  prefix: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}) {
  const { region, bucket, cloudfrontDomain } = ensureS3UploadConfig();
  const client = getS3UploadClient(region);
  const safeExtension = options.fileName.includes('.')
    ? (options.fileName.split('.').pop() ?? 'bin')
    : 'bin';
  const keyHash = createHash('sha1').update(options.fileName).digest('hex');
  const key = buildDatedObjectKey(`${options.prefix}/${keyHash}`, safeExtension);

  return uploadBufferToS3({
    client,
    bucket,
    cloudfrontDomain,
    key,
    body: options.body,
    contentType: options.contentType,
  });
}

export async function uploadPrivateExportArtifact(options: {
  prefix: string;
  fileName: string;
  contentType: string;
  body: Buffer;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  const { region, bucket } = ensurePrivateS3Config();
  const client = getS3UploadClient(region);
  const safeExtension = options.fileName.includes('.')
    ? (options.fileName.split('.').pop() ?? 'bin')
    : 'bin';
  const keyHash = createHash('sha1').update(options.fileName).digest('hex');
  const key = buildDatedObjectKey(`${options.prefix}/${keyHash}`, safeExtension, now);
  await uploadPrivateBufferToS3({
    client,
    bucket,
    key,
    body: options.body,
    contentType: options.contentType,
    expiresAt,
  });
  return { key, expiresAt };
}

export function getStableArtifactUrl(key: string) {
  const { cloudfrontDomain } = ensureS3UploadConfig();
  return buildCloudfrontUrl(cloudfrontDomain, key);
}

export async function uploadStableArtifact(options: {
  key: string;
  contentType: string;
  body: Buffer;
}) {
  const { region, bucket, cloudfrontDomain } = ensureS3UploadConfig();
  const client = getS3UploadClient(region);

  return uploadBufferToS3({
    client,
    bucket,
    cloudfrontDomain,
    key: options.key,
    body: options.body,
    contentType: options.contentType,
  });
}
