import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PUT } from './route';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('../../../lib/rbac', () => ({ requireMutationAccess: mocks.authorize }));
vi.mock('../../../lib/storefront-settings', () => ({
  loadStorefrontSettings: mocks.load,
  saveStorefrontSettings: mocks.save,
}));
vi.mock('../../../lib/storefront-revalidate', () => ({ revalidateStorefrontSettings: mocks.revalidate }));

describe('app/api/storefront-settings/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(null);
  });

  it('protects the hidden settings API with settings_manage', async () => {
    mocks.authorize.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('validates, saves, and revalidates contact settings', async () => {
    mocks.save.mockResolvedValue({ contactPhone: '0795342826', phoneEnabled: true });
    const response = await PUT(new NextRequest('http://localhost/api/storefront-settings', {
      method: 'PUT',
      body: JSON.stringify({ contactPhone: '0795 34 28 26', phoneEnabled: true }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(mocks.authorize).toHaveBeenCalledWith('settings');
    expect(mocks.save).toHaveBeenCalledWith({ contactPhone: '0795342826', phoneEnabled: true });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it('rejects invalid phone numbers without writing', async () => {
    const response = await PUT(new NextRequest('http://localhost/api/storefront-settings', {
      method: 'PUT',
      body: JSON.stringify({ contactPhone: '123', phoneEnabled: true }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
