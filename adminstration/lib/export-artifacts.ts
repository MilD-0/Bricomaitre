import { createHash } from 'crypto';

import {
  buildDatedObjectKey,
  ensureS3UploadConfig,
  getS3UploadClient,
  uploadBufferToS3,
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
    ? options.fileName.split('.').pop() ?? 'bin'
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
