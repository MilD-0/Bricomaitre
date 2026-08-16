import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const { requireMutationAccessMock } = vi.hoisted(() => ({
  requireMutationAccessMock: vi.fn(),
}));

import { POST } from '../route';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

describe('app/api/uploads/products/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sendMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-03T09:00:00.000Z'));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('returns 403 when RBAC blocks asset uploads', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const req = new NextRequest('http://localhost/api/uploads/products', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('fails with 500 when required env vars are missing', async () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_CLOUDFRONT_DOMAIN;

    const formData = new FormData();
    formData.append(
      'files',
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'photo.png', {
        type: 'image/png',
      }),
    );
    const req = new NextRequest('http://localhost/api/uploads/products', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });
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

    const formData = new FormData();
    const req = new NextRequest('http://localhost/api/uploads/products', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No files uploaded' });
  });

  it('uploads file and returns predictable cloudfront URL', async () => {
    process.env.AWS_REGION = 'eu-west-3';
    process.env.AWS_S3_BUCKET = 'bucket';
    process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';
    sendMock.mockResolvedValue({});

    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'photo.png',
      { type: 'image/png' },
    );
    const formData = new FormData();
    formData.append('files', file);

    const req = new NextRequest('http://localhost/api/uploads/products', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: vi.fn().mockResolvedValue(formData) });

    const res = await POST(req);

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(sendMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      urls: [expect.stringMatching(/^https:\/\/cdn\.example\.com\/products\/2025-01-03\/.+\.png$/)],
    });
  });
});
