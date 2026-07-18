import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), auth: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock('../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../lib/landing-pages', () => ({ listLandingPages: mocks.list, createLandingPage: mocks.create }));

import { GET, POST } from './route';

describe('admin landing pages route', () => {
  beforeEach(() => { mocks.access.mockReset().mockResolvedValue(null); mocks.auth.mockReset().mockResolvedValue({ user: { email: 'admin@example.com' } }); mocks.list.mockReset().mockResolvedValue([]); mocks.create.mockReset().mockResolvedValue({ id: 3 }); });
  it('uses assets permission for listing and creation', async () => {
    expect((await GET()).status).toBe(200);
    const response = await POST(new NextRequest('http://localhost/api/landing-pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: 8, locale: 'fr' }) }));
    expect(response.status).toBe(201);
    expect(mocks.access).toHaveBeenCalledWith('assets');
    expect(mocks.create).toHaveBeenCalledWith({ productId: 8, locale: 'fr', actorId: 'admin@example.com' });
  });
  it('rejects client-provided slugs so the product slug remains authoritative', async () => {
    const response = await POST(new NextRequest('http://localhost/api/landing-pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: 8, locale: 'fr', slug: '../script' }) }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not disclose data without access', async () => {
    mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await GET()).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
