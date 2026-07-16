import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), load: vi.fn() }));

vi.mock('../../../../lib/page-access', () => ({ requireStorefrontSettingsPageAccess: mocks.access }));
vi.mock('../../../../lib/storefront-settings', () => ({ loadStorefrontSettings: mocks.load }));
vi.mock('../../../../components/settings/storefront-settings-form', () => ({
  StorefrontSettingsForm: ({ initialSettings }: { initialSettings: { contactPhone: string } }) => (
    <div>Settings {initialSettings.contactPhone}</div>
  ),
}));

import StorefrontSettingsPage from './page';

describe('StorefrontSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ contactPhone: '0795342826', phoneEnabled: true });
  });

  it('is directly routable for authorized settings managers', async () => {
    render(await StorefrontSettingsPage({ params: Promise.resolve({ locale: 'fr' }) }));
    expect(mocks.access).toHaveBeenCalledWith('fr');
    expect(screen.getByText('Settings 0795342826')).toBeInTheDocument();
  });
});
