import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  auth: vi.fn(),
  detail: vi.fn(),
  saveActive: vi.fn(),
  setActive: vi.fn(),
  revalidate: vi.fn(),
  previewUrl: vi.fn(),
  ConflictError: class extends Error {},
  NotFoundError: class extends Error {},
}));
vi.mock('../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../lib/landing-pages', () => ({
  getLandingPageDetail: mocks.detail,
  LandingPageConflictError: mocks.ConflictError,
  LandingPageNotFoundError: mocks.NotFoundError,
  saveLandingPage: mocks.saveActive,
  setLandingPageActive: mocks.setActive,
}));
vi.mock('../../../../lib/storefront-revalidate', () => ({
  buildStorefrontLandingPagePreviewUrl: mocks.previewUrl,
  revalidateStorefrontLandingPages: mocks.revalidate,
}));

import { GET, PATCH } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/landing-pages/4', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin landing-page revision route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.detail.mockResolvedValue({
      id: 4,
      locale: 'fr',
      slug: 'perceuse-20v',
      active: true,
      currentRevision: 3,
    });
    mocks.previewUrl.mockReturnValue(
      'https://bricomaitre.com/fr/landing-preview/perceuse-20v?previewRevision=3&previewTimestamp=1787817600000&previewSignature=abc',
    );
    mocks.saveActive.mockResolvedValue({ id: 4, active: true, currentRevision: 4 });
    mocks.setActive.mockResolvedValue({ id: 4, active: false, currentRevision: 3 });
  });
  it('loads one current document for the focused builder', async () => {
    const response = await GET(new NextRequest('http://localhost/api/landing-pages/4'), {
      params: Promise.resolve({ id: '4' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(4);
  });

  it('redirects an authorized operator to a no-store preview of the saved revision', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/landing-pages/4?view=preview'),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain(
      'https://bricomaitre.com/fr/landing-preview/perceuse-20v?previewRevision=3',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.previewUrl).toHaveBeenCalledWith({
      locale: 'fr',
      slug: 'perceuse-20v',
      revision: 3,
    });
  });

  it('saves content and active state behind expected-revision protection', async () => {
    const body = {
      action: 'save-active',
      active: true,
      expectedRevision: 3,
      document: {
        seo: { title: 'Campaign', description: 'A focused campaign.', indexable: true },
        blocks: [
          {
            id: 'hero',
            type: 'product-hero',
            heading: 'Campaign',
            primaryCtaLabel: 'Order',
          },
          {
            id: 'final',
            type: 'final-cta',
            heading: 'Order now',
            primaryCtaLabel: 'Order',
          },
        ],
      },
    };
    const response = await PATCH(request(body), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.saveActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, active: true, expectedRevision: 3 }),
    );
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('returns a stable conflict response without discarding the client document', async () => {
    mocks.setActive.mockRejectedValue(new mocks.ConflictError('Changed elsewhere.'));
    const response = await PATCH(
      request({ action: 'set-active', active: false, expectedRevision: 2 }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Changed elsewhere.',
      code: 'stale_revision',
    });
  });
  it('rejects obsolete and unknown actions without creating a revision', async () => {
    const response = await PATCH(request({ action: 'inject-code', source: '<script />' }), {
      params: Promise.resolve({ id: '4' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.saveActive).not.toHaveBeenCalled();

    const obsolete = await PATCH(request({ action: 'publish' }), {
      params: Promise.resolve({ id: '4' }),
    });
    expect(obsolete.status).toBe(400);
  });
});
