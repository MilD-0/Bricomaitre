import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { loadAssetsMetaDataMock, requireAppAccessMock } = vi.hoisted(() => ({
  loadAssetsMetaDataMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
}));

vi.mock('../../../../lib/admin-assets-data', () => ({
  loadAssetsMetaData: loadAssetsMetaDataMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireAppAccess: requireAppAccessMock,
}));

describe('app/api/assets/meta/route', () => {
  beforeEach(() => {
    loadAssetsMetaDataMock.mockReset();
    requireAppAccessMock.mockReset();
    requireAppAccessMock.mockResolvedValue(null);
  });

  it('returns 401 when app access is denied', async () => {
    requireAppAccessMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns asset metadata for authenticated admin users', async () => {
    loadAssetsMetaDataMock.mockResolvedValue({ products: [{ id: 1 }], brands: [], categories: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ products: [{ id: 1 }], brands: [], categories: [] });
  });
});
