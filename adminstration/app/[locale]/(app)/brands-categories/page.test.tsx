import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, requireBrandsCategoriesPageAccessMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requireBrandsCategoriesPageAccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireBrandsCategoriesPageAccess: requireBrandsCategoriesPageAccessMock,
}));

import BrandsCategoriesPage from './page';

describe('BrandsCategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects the legacy combined page to the brands page', async () => {
    await BrandsCategoriesPage({ params: Promise.resolve({ locale: 'en' }) });

    expect(requireBrandsCategoriesPageAccessMock).toHaveBeenCalledWith('en');
    expect(redirectMock).toHaveBeenCalledWith('/en/brands');
  });
});
