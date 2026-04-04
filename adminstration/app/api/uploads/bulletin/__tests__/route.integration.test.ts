import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const doneMock = vi.fn();
const {
  requireBulletinSessionMock,
  uploadConstructorMock,
} = vi.hoisted(() => ({
  requireBulletinSessionMock: vi.fn(),
  uploadConstructorMock: vi.fn(),
}));

import { POST } from '../route';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(public config: unknown) {}
  },
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(input: unknown) {
      uploadConstructorMock(input);
    }

    done = doneMock;
  },
}));

vi.mock('../../../../../lib/bulletin-server', () => ({
  requireBulletinSession: requireBulletinSessionMock,
}));

describe('app/api/uploads/bulletin/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    doneMock.mockReset();
    uploadConstructorMock.mockReset();
    requireBulletinSessionMock.mockReset();
    requireBulletinSessionMock.mockResolvedValue({ session: { user: { id: 'user-1', email: 'user@example.com' } }, response: null });
    doneMock.mockResolvedValue(undefined);
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

    const res = await POST(new NextRequest('http://localhost/api/uploads/bulletin', { method: 'POST' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('fails with 500 when required env vars are missing', async () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_CLOUDFRONT_DOMAIN;

    const req = { formData: vi.fn().mockResolvedValue(new FormData()) } as unknown as NextRequest;
    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required env vars: AWS_REGION, AWS_S3_BUCKET, AWS_CLOUDFRONT_DOMAIN',
    });
  });

  it('returns 400 when no files are present in form-data', async () => {
    process.env.AWS_REGION = 'eu-west-3';
    process.env.AWS_S3_BUCKET = 'bucket';
    process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';

    const req = { formData: vi.fn().mockResolvedValue(new FormData()) } as unknown as NextRequest;
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No files uploaded' });
  });

  it('uploads a file and returns bulletin attachment metadata', async () => {
    process.env.AWS_REGION = 'eu-west-3';
    process.env.AWS_S3_BUCKET = 'bucket';
    process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';

    const file = new File([new Uint8Array([1, 2, 3])], 'brief.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'stream', {
      configurable: true,
      value: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
    });

    const formData = {
      getAll: vi.fn().mockReturnValue([file]),
    };

    const req = { formData: vi.fn().mockResolvedValue(formData) } as unknown as NextRequest;
    const res = await POST(req);

    expect(uploadConstructorMock).toHaveBeenCalledOnce();
    expect(doneMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      files: [
        expect.objectContaining({
          fileName: 'brief.pdf',
          fileUrl: expect.stringMatching(/^https:\/\/cdn\.example\.com\/bulletin\/2026-03-30\/.+\.pdf$/),
          fileKey: expect.stringMatching(/^bulletin\/2026-03-30\/.+\.pdf$/),
          contentType: 'application/pdf',
          size: 3,
        }),
      ],
    });
  });
});
