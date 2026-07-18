import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAiChat } from './admin-ai-chat';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('AdminAiChat', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history')) {
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      }
      if (url.includes('/api/ai/chat')) {
        return new Response(JSON.stringify({ message: 'A reviewable proposal is ready.', toolResults: {} }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses an icon-only mobile launcher and an integrated responsive workspace', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);

    const launcher = screen.getByRole('button', { name: 'aiChat.open' });
    expect(within(launcher).getByText('aiChat.open')).toHaveClass('hidden', 'sm:inline');
    expect(launcher).toHaveClass('size-12', 'sm:w-auto');
    await user.click(launcher);

    const dialog = await screen.findByRole('dialog', { name: 'aiChat.title' });
    expect(dialog).toHaveClass('max-w-[76rem]', 'overflow-hidden');
    expect(within(dialog).getByText('aiChat.reviewMode')).toBeInTheDocument();
    expect(within(dialog).getByRole('complementary', { name: 'aiChat.history' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'aiChat.close' })).toBeInTheDocument();
  });

  it('sends from the keyboard and renders the response as a conversation', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const composer = await screen.findByRole('textbox', { name: 'aiChat.placeholder' });
    await user.type(composer, 'Find missing Arabic titles');
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByText('A reviewable proposal is ready.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/ai/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'Find missing Arabic titles' }),
    }));
    await waitFor(() => expect(composer).toHaveValue(''));
  });
});
