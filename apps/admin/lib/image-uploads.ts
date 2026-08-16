import {
  buildDatedObjectKey,
  ensureS3UploadConfig,
  getS3UploadClient,
  uploadBufferToS3,
} from './s3-upload';
import { validateAndBufferImageUploads, validateImageRequestLength } from './upload-validation';

type ImageUploadResult =
  { ok: true; urls: string[] } | { ok: false; error: string; status: 400 | 413 };

export async function uploadImages(request: Request, prefix: string): Promise<ImageUploadResult> {
  const requestLengthError = validateImageRequestLength(request);
  if (requestLengthError) return requestLengthError;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return { ok: false, error: 'Invalid multipart request body', status: 400 };
  }

  const files = formData.getAll('files').filter((file): file is File => file instanceof File);
  const validated = await validateAndBufferImageUploads(files);
  if (!validated.ok) return validated;

  const { region, bucket, cloudfrontDomain } = ensureS3UploadConfig();
  const client = getS3UploadClient(region);
  const urls = await Promise.all(
    validated.files.map(({ buffer, contentType, extension }) => {
      const key = buildDatedObjectKey(prefix, extension);
      return uploadBufferToS3({
        client,
        bucket,
        cloudfrontDomain,
        key,
        body: buffer,
        contentType,
      });
    }),
  );

  return { ok: true, urls };
}
