import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildMetaCatalogImageKeySeed, createSquareCatalogImage } from './meta-catalog';

const {
  sharpResizeMock,
  sharpJpegMock,
  sharpToBufferMock,
  sharpRotateMock,
  sharpMock,
  buildDatedObjectKeyMock,
  ensureS3UploadConfigMock,
  getS3UploadClientMock,
  uploadBufferToS3Mock,
} = vi.hoisted(() => {
  const sharpToBufferMock = vi.fn();
  const sharpJpegMock = vi.fn(() => ({ toBuffer: sharpToBufferMock }));
  const sharpResizeMock = vi.fn(() => ({ jpeg: sharpJpegMock }));
  const sharpRotateMock = vi.fn(() => ({ resize: sharpResizeMock }));
  const sharpMock = vi.fn(() => ({ rotate: sharpRotateMock }));

  return {
    sharpResizeMock,
    sharpJpegMock,
    sharpToBufferMock,
    sharpRotateMock,
    sharpMock,
    buildDatedObjectKeyMock: vi.fn(),
    ensureS3UploadConfigMock: vi.fn(),
    getS3UploadClientMock: vi.fn(),
    uploadBufferToS3Mock: vi.fn(),
  };
});

vi.mock('sharp', () => ({
  default: sharpMock,
}));

vi.mock('./s3-upload', () => ({
  buildDatedObjectKey: buildDatedObjectKeyMock,
  ensureS3UploadConfig: ensureS3UploadConfigMock,
  getS3UploadClient: getS3UploadClientMock,
  uploadBufferToS3: uploadBufferToS3Mock,
}));

describe('lib/meta-catalog', () => {
  beforeEach(() => {
    sharpMock.mockClear();
    sharpRotateMock.mockClear();
    sharpResizeMock.mockClear();
    sharpJpegMock.mockClear();
    sharpToBufferMock.mockReset();
    buildDatedObjectKeyMock.mockReset();
    ensureS3UploadConfigMock.mockReset();
    getS3UploadClientMock.mockReset();
    uploadBufferToS3Mock.mockReset();
    vi.restoreAllMocks();

    sharpToBufferMock.mockResolvedValue(Buffer.from('square-image'));
    buildDatedObjectKeyMock.mockReturnValue('products/meta-catalog/hash/2026-03-31/file.jpg');
    ensureS3UploadConfigMock.mockReturnValue({
      region: 'eu-west-3',
      bucket: 'uploads-bucket',
      cloudfrontDomain: 'cdn.example.com',
    });
    getS3UploadClientMock.mockReturnValue({ client: true });
    uploadBufferToS3Mock.mockResolvedValue('https://cdn.example.com/products/meta-catalog/hash/2026-03-31/file.jpg');
  });

  it('builds a stable cache seed from the product timestamp and first image', () => {
    expect(buildMetaCatalogImageKeySeed({
      id: 42,
      images: ['https://raw.example.com/image.jpg'],
      updatedAt: new Date('2026-03-31T04:05:06.000Z'),
    } as never)).toBe('42:2026-03-31T04:05:06.000Z:https://raw.example.com/image.jpg');
  });

  it('creates a squared image and uploads it through the shared S3 utilities', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    } as Response);

    const result = await createSquareCatalogImage(
      'https://raw.example.com/source.jpg',
      '42:2026-03-31T04:05:06.000Z:https://raw.example.com/source.jpg',
      new Date('2026-03-31T08:09:10.000Z'),
    );

    expect(fetchMock).toHaveBeenCalledWith('https://raw.example.com/source.jpg', { cache: 'no-store' });
    expect(sharpMock).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(sharpRotateMock).toHaveBeenCalledOnce();
    expect(sharpResizeMock).toHaveBeenCalledWith(1024, 1024, { fit: 'cover', position: 'centre' });
    expect(sharpJpegMock).toHaveBeenCalledWith({ quality: 90, mozjpeg: true });
    expect(buildDatedObjectKeyMock).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/meta-catalog\/[a-f0-9]{40}$/),
      'jpg',
      new Date('2026-03-31T08:09:10.000Z'),
    );
    expect(getS3UploadClientMock).toHaveBeenCalledWith('eu-west-3');
    expect(uploadBufferToS3Mock).toHaveBeenCalledWith({
      client: { client: true },
      bucket: 'uploads-bucket',
      cloudfrontDomain: 'cdn.example.com',
      key: 'products/meta-catalog/hash/2026-03-31/file.jpg',
      body: Buffer.from('square-image'),
      contentType: 'image/jpeg',
    });
    expect(result).toBe('https://cdn.example.com/products/meta-catalog/hash/2026-03-31/file.jpg');
  });

  it('throws when the source image cannot be fetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);

    await expect(createSquareCatalogImage('https://raw.example.com/missing.jpg', 'seed')).rejects.toThrow(
      'Failed to fetch product image: https://raw.example.com/missing.jpg',
    );
    expect(uploadBufferToS3Mock).not.toHaveBeenCalled();
  });
});
