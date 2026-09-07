import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { requireSessionMock, readObjectMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  readObjectMock: vi.fn(),
}));

vi.mock('@/lib/bulletin-server', () => ({
  requireBulletinSession: requireSessionMock,
}));
vi.mock('@/lib/s3-upload', () => ({
  readPrivateS3Object: readObjectMock,
  isS3ObjectNotFound: (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey'),
}));

describe('bulletin attachment access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({ session: { user: { id: 'user-1' } }, response: null });
    readObjectMock.mockResolvedValue({
      ContentType: 'application/pdf',
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('private attachment'));
              controller.close();
            },
          }),
      },
    });
  });

  it('requires a Bulletin session before reading private storage', async () => {
    requireSessionMock.mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(new NextRequest('http://localhost/attachment'), {
      params: Promise.resolve({ key: ['bulletin', '2026-09-04', 'file.pdf'] }),
    });

    expect(response.status).toBe(401);
    expect(readObjectMock).not.toHaveBeenCalled();
  });

  it('serves only Bulletin-prefixed keys with private no-store headers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/attachment?name=customer%20brief.pdf'),
      { params: Promise.resolve({ key: ['bulletin', '2026-09-04', 'file.pdf'] }) },
    );

    expect(readObjectMock).toHaveBeenCalledWith('bulletin/2026-09-04/file.pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="customer brief.pdf"; filename*=UTF-8\'\'customer%20brief.pdf',
    );
    await expect(response.text()).resolves.toBe('private attachment');
  });

  it('preserves Arabic attachment filenames without invalid HTTP header characters', async () => {
    const name = 'تسليم.pdf';
    const response = await GET(
      new NextRequest(`http://localhost/attachment?name=${encodeURIComponent(name)}`),
      { params: Promise.resolve({ key: ['bulletin', 'file.pdf'] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    await expect(response.text()).resolves.toBe('private attachment');
  });

  it('rejects traversal and non-Bulletin storage keys', async () => {
    for (const key of [
      ['exports', 'orders', 'private.xlsx'],
      ['bulletin', '..', 'private.pdf'],
    ]) {
      const response = await GET(new NextRequest('http://localhost/attachment'), {
        params: Promise.resolve({ key }),
      });
      expect(response.status).toBe(404);
    }
    expect(readObjectMock).not.toHaveBeenCalled();
  });
  it.each([
    ['text/plain', 'text/plain; charset=utf-8'],
    ['text/csv', 'text/csv; charset=utf-8'],
    ['text/plain; charset=windows-1252', 'text/plain; charset=windows-1252'],
    ['application/pdf', 'application/pdf'],
  ])(
    'serves %s with explicit text decoding while preserving bytes',
    async (contentType, expected) => {
      const bytes = new TextEncoder().encode('CLOPS reçu محفوظة');
      readObjectMock.mockResolvedValue({
        ContentType: contentType,
        Body: {
          transformToWebStream: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
        },
      });
      const response = await GET(new NextRequest('http://localhost/attachment'), {
        params: Promise.resolve({ key: ['bulletin', 'note.txt'] }),
      });
      expect(response.headers.get('content-type')).toBe(expected);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    },
  );
});
