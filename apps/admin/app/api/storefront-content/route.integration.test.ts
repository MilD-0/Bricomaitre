import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  loadStorefrontContentAdminMock,
  requireMutationAccessMock,
  revalidateStorefrontSettingsMock,
  saveStorefrontAnnouncementMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadStorefrontContentAdminMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  revalidateStorefrontSettingsMock: vi.fn(),
  saveStorefrontAnnouncementMock: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({ auth: authMock }));
vi.mock('../../../lib/rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));
vi.mock('../../../lib/storefront-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/storefront-content')>()),
  loadStorefrontContentAdmin: loadStorefrontContentAdminMock,
  saveStorefrontAnnouncement: saveStorefrontAnnouncementMock,
}));
vi.mock('../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontSettings: revalidateStorefrontSettingsMock,
}));

import { GET, PUT } from './route';

describe('/api/storefront-content', () => {
  const announcement = { messageFr: 'Livraison offerte', messageAr: 'توصيل مجاني', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    authMock.mockResolvedValue({ user: { email: 'operator@example.com' } });
    loadStorefrontContentAdminMock.mockResolvedValue(announcement);
    saveStorefrontAnnouncementMock.mockResolvedValue(announcement);
    revalidateStorefrontSettingsMock.mockResolvedValue(undefined);
  });

  it('enforces settings access for reads and writes', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    expect((await GET()).status).toBe(403);
    expect(
      (
        await PUT(
          new Request('http://localhost/api/storefront-content', {
            method: 'PUT',
            body: JSON.stringify(announcement),
          }),
        )
      ).status,
    ).toBe(403);
    expect(loadStorefrontContentAdminMock).not.toHaveBeenCalled();
    expect(saveStorefrontAnnouncementMock).not.toHaveBeenCalled();
  });

  it('returns current storefront content', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(announcement);
  });

  it('returns 400 for malformed or invalid announcement payloads', async () => {
    const malformed = await PUT(
      new Request('http://localhost/api/storefront-content', {
        method: 'PUT',
        body: '{',
      }),
    );
    expect(malformed.status).toBe(400);

    const invalid = await PUT(
      new Request('http://localhost/api/storefront-content', {
        method: 'PUT',
        body: JSON.stringify({ messageFr: '', active: 'yes' }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(saveStorefrontAnnouncementMock).not.toHaveBeenCalled();
  });

  it('saves with the authenticated actor and revalidates the storefront', async () => {
    const response = await PUT(
      new Request('http://localhost/api/storefront-content', {
        method: 'PUT',
        body: JSON.stringify(announcement),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, item: announcement });
    expect(saveStorefrontAnnouncementMock).toHaveBeenCalledWith(
      announcement,
      'operator@example.com',
    );
    expect(revalidateStorefrontSettingsMock).toHaveBeenCalledOnce();
  });

  it('rejects an active announcement missing either locale before writing', async () => {
    for (const field of ['messageFr', 'messageAr']) {
      const response = await PUT(
        new Request('http://localhost/api/storefront-content', {
          method: 'PUT',
          body: JSON.stringify({ ...announcement, [field]: '' }),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(saveStorefrontAnnouncementMock).not.toHaveBeenCalled();
    expect(revalidateStorefrontSettingsMock).not.toHaveBeenCalled();
  });
});
