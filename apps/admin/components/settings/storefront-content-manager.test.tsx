import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import { StorefrontContentManager } from './storefront-content-manager';

vi.mock('../../lib/toast', () => ({
  toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn() },
}));

describe('StorefrontContentManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves the two localized messages and active state as one announcement', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StorefrontContentManager
          initialContent={{
            messageFr: 'Livraison offerte',
            messageAr: 'توصيل مجاني',
            active: true,
          }}
        />
      </NextIntlClientProvider>,
    );

    const frenchMessage = screen.getByLabelText('French message');
    await user.clear(frenchMessage);
    await user.type(frenchMessage, 'Livraison demain');
    await user.click(screen.getByRole('button', { name: 'Save announcement' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messageFr: 'Livraison demain',
      messageAr: 'توصيل مجاني',
      active: true,
    });
  });
});
