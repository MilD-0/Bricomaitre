import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireBulletinSessionMock,
  ensureS3UploadConfigMock,
  getS3UploadClientMock,
  uploadBufferToS3Mock,
  buildDatedObjectKeyMock,
} = vi.hoisted(() => ({
  requireBulletinSessionMock: vi.fn(),
  ensureS3UploadConfigMock: vi.fn(),
  getS3UploadClientMock: vi.fn(),
  uploadBufferToS3Mock: vi.fn(),
  buildDatedObjectKeyMock: vi.fn(),
}));

import { POST } from '../route';

vi.mock('../../../../../lib/s3-upload', () => ({
  ensureS3UploadConfig: ensureS3UploadConfigMock,
  getS3UploadClient: getS3UploadClientMock,
  uploadBufferToS3: uploadBufferToS3Mock,
  buildDatedObjectKey: buildDatedObjectKeyMock,
}));

vi.mock('../../../../../lib/bulletin-server', () => ({
  requireBulletinSession: requireBulletinSessionMock,
}));

describe('app/api/uploads/bulletin/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    ensureS3UploadConfigMock.mockReset();
    getS3UploadClientMock.mockReset();
    uploadBufferToS3Mock.mockReset();
    buildDatedObjectKeyMock.mockReset();
    requireBulletinSessionMock.mockReset();
    requireBulletinSessionMock.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'user@example.com' } },
      response: null,
    });
    ensureS3UploadConfigMock.mockReturnValue({
      region: 'eu-west-3',
      bucket: 'bucket',
      cloudfrontDomain: 'cdn.example.com',
    });
    getS3UploadClientMock.mockReturnValue({ client: true });
    buildDatedObjectKeyMock.mockReturnValue('bulletin/2026-03-30/file.pdf');
    uploadBufferToS3Mock.mockResolvedValue('https://cdn.example.com/bulletin/2026-03-30/file.pdf');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T08:00:00.000Z'));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('returns session response when bulletin access is blocked', async () => {
    requireBulletinSessionMock.mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('fails with 500 when required env vars are missing', async () => {
    ensureS3UploadConfigMock.mockImplementation(() => {
      throw new Error(
        'Missing required env vars: AWS_REGION, AWS_S3_BUCKET, AWS_CLOUDFRONT_DOMAIN',
      );
    });

    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required env vars: AWS_REGION, AWS_S3_BUCKET, AWS_CLOUDFRONT_DOMAIN',
    });
  });

  it('returns 400 when no files are present in form-data', async () => {
    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(new FormData()) });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No files uploaded' });
  });

  it('uploads a file and returns bulletin attachment metadata', async () => {
    const file = new File(['%PDF-1.7'], 'brief.pdf', { type: 'application/pdf' });

    const formData = {
      getAll: vi.fn().mockReturnValue([file]),
    };

    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });
    const res = await POST(req);

    expect(uploadBufferToS3Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'bucket',
        cloudfrontDomain: 'cdn.example.com',
        key: 'bulletin/2026-03-30/file.pdf',
        body: expect.any(Buffer),
        contentType: 'application/pdf',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      files: [
        expect.objectContaining({
          fileName: 'brief.pdf',
          fileUrl: 'https://cdn.example.com/bulletin/2026-03-30/file.pdf',
          fileKey: 'bulletin/2026-03-30/file.pdf',
          contentType: 'application/pdf',
          size: 8,
        }),
      ],
    });
  });
});
