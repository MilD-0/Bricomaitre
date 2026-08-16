import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_UPLOAD_BYTES, validateAndBufferImageUploads } from './upload-validation';

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
