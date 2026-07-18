import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), auth: vi.fn(), save: vi.fn(), publication: vi.fn(), revalidate: vi.fn() }));
vi.mock('../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../lib/landing-pages', () => ({ saveLandingPageRevision: mocks.save, setLandingPagePublication: mocks.publication }));
vi.mock('../../../../lib/storefront-revalidate', () => ({ revalidateStorefrontLandingPages: mocks.revalidate }));

import { PATCH } from './route';

function request(body: unknown) { return new NextRequest('http://localhost/api/landing-pages/4', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

describe('admin landing-page revision route', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(null); mocks.auth.mockResolvedValue({ user: { email: 'admin@example.com' } }); mocks.publication.mockResolvedValue({ id: 4, status: 'published' }); });
  it('publishes the pinned draft and invalidates both storefront caches', async () => {
    const response = await PATCH(request({ action: 'publish' }), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.publication).toHaveBeenCalledWith({ id: 4, publish: true, actorId: 'admin@example.com' });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
  it('rejects an invalid action without creating a revision', async () => {
    const response = await PATCH(request({ action: 'inject-code', source: '<script />' }), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.publication).not.toHaveBeenCalled();
  });
});
