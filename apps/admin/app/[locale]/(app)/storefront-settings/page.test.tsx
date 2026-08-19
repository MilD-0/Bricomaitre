import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permanentRedirect: vi.fn() }));

vi.mock('next/navigation', () => ({ permanentRedirect: mocks.permanentRedirect }));

import StorefrontSettingsPage from './page';

describe('StorefrontSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permanently redirects the retired page into Administration', async () => {
    await StorefrontSettingsPage({ params: Promise.resolve({ locale: 'fr' }) });
    expect(mocks.permanentRedirect).toHaveBeenCalledWith('/fr/administration/storefront');
  });
});
