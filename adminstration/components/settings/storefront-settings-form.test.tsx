import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontSettingsForm } from './storefront-settings-form';

const mocks = vi.hoisted(() => ({
  loading: vi.fn(() => 'toast-id'),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../lib/toast', () => ({ toast: mocks }));

describe('StorefrontSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contactPhone: '0795342826',
      phoneEnabled: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  it('saves the edited number and call availability', async () => {
    const user = userEvent.setup();
    render(<StorefrontSettingsForm initialSettings={{
      contactPhone: '0795342826',
      phoneEnabled: true,
    }} />);

    const phoneInput = screen.getByRole('textbox');
    await user.clear(phoneInput);
    await user.type(phoneInput, '+213 795 34 28 26');
    await user.click(screen.getByRole('switch', { name: 'callsLabel' }));
    await user.click(screen.getByRole('button', { name: 'saveAction' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/storefront-settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        contactPhone: '+213 795 34 28 26',
        phoneEnabled: false,
      }),
    })));
    expect(mocks.success).toHaveBeenCalledWith('saved', { id: 'toast-id' });
  });
});
