import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontSettingsForm } from './storefront-settings-form';

const mocks = vi.hoisted(() => ({
  loading: vi.fn(() => 'toast-id'),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../lib/toast', () => ({ toast: mocks }));

describe('StorefrontSettingsForm', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            contactPhone: '0795342826',
            phoneEnabled: false,
            aiAssistantEnabled: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  it('keeps contact calls enabled while saving the compact settings form once', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StorefrontSettingsForm
        initialSettings={{
          contactPhone: '0795342826',
          phoneEnabled: false,
          aiAssistantEnabled: true,
        }}
        modelOptions={['openai/gpt-4.1-mini', 'deepseek/deepseek-chat-v3-0324']}
      />,
    );

    expect(container.querySelector('form')).toHaveClass('pt-6', 'sm:pt-9');

    expect(screen.getAllByRole('heading')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'contactTitle' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'assistantTitle' })).toBeVisible();
    expect(screen.queryByText('description')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'callsLabel' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'saveAction' })).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'modelLabel' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'fallbackModelLabel' })).not.toBeInTheDocument();

    const phoneInput = screen.getByRole('textbox', { name: 'contactTitle' });
    await user.clear(phoneInput);
    await user.type(phoneInput, '+213 795 34 28 26');
    await user.click(screen.getByRole('switch', { name: 'assistantTitle' }));
    await user.click(screen.getByRole('button', { name: 'saveAction' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('/api/storefront-settings');
    expect(init).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      contactPhone: '+213 795 34 28 26',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
    expect(mocks.success).toHaveBeenCalledWith('saved', { id: 'toast-id' });
  });
});
