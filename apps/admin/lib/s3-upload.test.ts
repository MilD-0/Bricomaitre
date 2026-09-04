import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { MAX_IMAGE_UPLOAD_BYTES, validateAndBufferImageUploads } from './upload-validation';
import { buildCloudfrontUrl, deleteExpiredPrivateS3Objects } from './s3-upload';

describe('public S3 object URLs', () => {
  it('defaults a bare CDN domain to HTTPS', () => {
    expect(buildCloudfrontUrl('cdn.example.com', 'products/image.webp')).toBe(
      'https://cdn.example.com/products/image.webp',
    );
  });

  it('preserves an explicit origin for a local S3-compatible service', () => {
    expect(buildCloudfrontUrl('http://127.0.0.1:3900/demo', 'products/image.webp')).toBe(
      'http://127.0.0.1:3900/demo/products/image.webp',
    );
  });
});

describe('image upload validation', () => {
  it('accepts supported image content and derives canonical metadata', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'camera-upload', {
      type: 'image/jpeg',
    });
    const result = await validateAndBufferImageUploads([file]);

    expect(result).toMatchObject({
      ok: true,
      files: [{ extension: 'jpg', contentType: 'image/jpeg' }],
    });
  });

  it('rejects unsupported declared content types', async () => {
    const file = new File(['payload'], 'payload.svg', { type: 'image/svg+xml' });
    expect(await validateAndBufferImageUploads([file])).toMatchObject({
      ok: false,
      error: expect.stringContaining('Only JPEG'),
      status: 400,
    });
  });

  it('rejects content that does not match its declared image type', async () => {
    const file = new File(['not-a-png'], 'payload.png', { type: 'image/png' });
    expect(await validateAndBufferImageUploads([file])).toEqual({
      ok: false,
      error: 'File content does not match its declared image type: payload.png',
      status: 400,
    });
  });

  it('rejects oversized individual images', async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], 'large.png', {
      type: 'image/png',
    });
    expect(await validateAndBufferImageUploads([file])).toEqual({
      ok: false,
      error: 'Each image must be 10 MB or smaller',
      status: 413,
    });
  });

  it('rejects excessive file counts', async () => {
    const files = Array.from(
      { length: 13 },
      (_, index) => new File(['x'], `${index}.webp`, { type: 'image/webp' }),
    );
    expect(await validateAndBufferImageUploads(files)).toEqual({
      ok: false,
      error: 'Upload at most 12 images at a time',
      status: 400,
    });
  });
});

describe('private S3 retention', () => {
  it('deletes only objects at or beyond the retention cutoff', async () => {
    const send = vi.fn(async (command: ListObjectsV2Command | DeleteObjectsCommand) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: 'exports/orders/expired.xlsx', LastModified: new Date('2026-09-03T00:00:00Z') },
            { Key: 'exports/orders/cutoff.xlsx', LastModified: new Date('2026-09-04T00:00:00Z') },
            { Key: 'exports/orders/current.xlsx', LastModified: new Date('2026-09-04T00:00:01Z') },
          ],
        };
      }
      return { Errors: [] };
    });

    await expect(
      deleteExpiredPrivateS3Objects({
        prefix: 'exports/orders/',
        cutoff: new Date('2026-09-04T00:00:00Z'),
        client: { send } as unknown as S3Client,
        bucket: 'private-artifacts',
      }),
    ).resolves.toBe(2);

    expect(send).toHaveBeenCalledTimes(2);
    const deletion = send.mock.calls[1]![0];
    expect(deletion).toBeInstanceOf(DeleteObjectsCommand);
    expect((deletion as DeleteObjectsCommand).input.Delete?.Objects).toEqual([
      { Key: 'exports/orders/expired.xlsx' },
      { Key: 'exports/orders/cutoff.xlsx' },
    ]);
  });
});
