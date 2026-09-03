import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireBulletinSessionMock,
  ensurePrivateS3ConfigMock,
  getS3UploadClientMock,
  uploadPrivateBufferToS3Mock,
  buildDatedObjectKeyMock,
} = vi.hoisted(() => ({
  requireBulletinSessionMock: vi.fn(),
  ensurePrivateS3ConfigMock: vi.fn(),
  getS3UploadClientMock: vi.fn(),
  uploadPrivateBufferToS3Mock: vi.fn(),
  buildDatedObjectKeyMock: vi.fn(),
}));

import { POST } from '../route';

vi.mock('../../../../../lib/s3-upload', () => ({
  ensurePrivateS3Config: ensurePrivateS3ConfigMock,
  getS3UploadClient: getS3UploadClientMock,
  uploadPrivateBufferToS3: uploadPrivateBufferToS3Mock,
  deletePrivateS3Object: vi.fn().mockResolvedValue(undefined),
  buildDatedObjectKey: buildDatedObjectKeyMock,
}));

vi.mock('../../../../../lib/bulletin-server', () => ({
  requireBulletinSession: requireBulletinSessionMock,
}));

describe('app/api/uploads/bulletin/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    ensurePrivateS3ConfigMock.mockReset();
    getS3UploadClientMock.mockReset();
    uploadPrivateBufferToS3Mock.mockReset();
    buildDatedObjectKeyMock.mockReset();
    requireBulletinSessionMock.mockReset();
    requireBulletinSessionMock.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'user@example.com' } },
      response: null,
    });
    ensurePrivateS3ConfigMock.mockReturnValue({
      region: 'eu-west-3',
      bucket: 'bucket',
    });
    getS3UploadClientMock.mockReturnValue({ client: true });
    buildDatedObjectKeyMock.mockReturnValue('bulletin/2026-03-30/file.pdf');
    uploadPrivateBufferToS3Mock.mockResolvedValue(undefined);
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

  it('fails with 500 when required env vars are missing for a valid upload', async () => {
    ensurePrivateS3ConfigMock.mockImplementation(() => {
      throw new Error('Missing required env vars: AWS_REGION, AWS_S3_BUCKET');
    });

    const formData = new FormData();
    formData.append('files', new File(['%PDF-1.7'], 'brief.pdf', { type: 'application/pdf' }));
    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });
    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required env vars: AWS_REGION, AWS_S3_BUCKET',
    });
  });

  it('returns 400 when no files are present in form-data', async () => {
    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(new FormData()) });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No files uploaded' });
    expect(ensurePrivateS3ConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed multipart data before accessing storage configuration', async () => {
    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', {
      value: vi.fn().mockRejectedValue(new Error('malformed body')),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid multipart request body' });
    expect(ensurePrivateS3ConfigMock).not.toHaveBeenCalled();
  });

  it('rejects declared oversized requests before parsing or accessing storage', async () => {
    const req = new NextRequest('http://localhost/api/uploads/bulletin', {
      method: 'POST',
      headers: { 'content-length': String(50 * 1024 * 1024) },
    });
    const formData = vi.fn();
    Object.defineProperty(req, 'formData', { value: formData });

    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(ensurePrivateS3ConfigMock).not.toHaveBeenCalled();
  });

  it('uploads a file and returns bulletin attachment metadata', async () => {
    const file = new File(['%PDF-1.7'], 'brief.pdf', { type: 'application/pdf' });

    const formData = {
      getAll: vi.fn().mockReturnValue([file]),
    };

    const req = new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });
    const res = await POST(req);

    expect(uploadPrivateBufferToS3Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'bucket',
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
          fileUrl: '/api/bulletin/attachments/bulletin/2026-03-30/file.pdf?name=brief.pdf',
          fileKey: 'bulletin/2026-03-30/file.pdf',
          contentType: 'application/pdf',
          size: 8,
        }),
      ],
    });
  });
});
