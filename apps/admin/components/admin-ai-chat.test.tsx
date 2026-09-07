import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_AI_OPEN_EVENT } from '../lib/admin-ai-events';
import { AdminAiChat } from './admin-ai-chat';
import { ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY } from './ai-chat/use-ai-chat';
import { ADMIN_AI_MODEL_STORAGE_KEY } from './ai-chat/use-ai-chat';
import { ADMIN_AI_REASONING_EFFORT_STORAGE_KEY } from './ai-chat/use-ai-chat';
import { AdminAiSurfaceProvider } from './admin-ai-surface-context';

function chatResponse(body: string | object, init?: ResponseInit) {
  const {
    message,
    conversation,
    toolResults,
    messageId = null,
  } = typeof body === 'string'
    ? JSON.parse(body)
    : (body as {
        message: string;
        conversation: unknown;
        toolResults: unknown;
        messageId?: number;
      });
  return new Response(
    [
      JSON.stringify({ type: 'text-delta', delta: message }),
      JSON.stringify({ type: 'result', conversation, toolResults, messageId }),
      '',
    ].join('\n'),
    { ...init, headers: { 'content-type': 'application/x-ndjson' } },
  );
}

const navigation = vi.hoisted(() => ({ pathname: '/en/stats/website' }));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams('range=90d&grain=week'),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminAiChat', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/api/ai/history')) {
          return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
        }
        if (url === '/api/ai/conversations') {
          return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
        }
        if (url.includes('/api/ai/chat')) {
          return chatResponse(
            JSON.stringify({
              message: 'A reviewable proposal is ready.',
              toolResults: {},
              conversation: {
                id: 12,
                sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
                title: 'Find missing Arabic titles',
              },
              messageId: 71,
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 200 });
      }),
    );
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
    expect(within(dialog).getByRole('complementary', { name: 'aiChat.chats' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'aiChat.close' })).toBeInTheDocument();
    const fullScreen = within(dialog).getByRole('button', { name: 'aiChat.fullScreen' });
    await user.click(fullScreen);
    expect(dialog).toHaveAttribute('data-full-screen', 'true');
    expect(dialog).toHaveClass('!h-dvh', '!max-h-dvh', '!max-w-none', '!rounded-none');
    expect(dialog.parentElement).toHaveClass('h-full');
    await user.click(within(dialog).getByRole('button', { name: 'aiChat.exitFullScreen' }));
    expect(dialog).toHaveAttribute('data-full-screen', 'false');
    expect(within(dialog).queryByText('aiChat.reviewMode')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('aiChat.description')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('aiChat.sendHint')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'aiChat.autoAccept' })).toBeInTheDocument();
  });

  it('opens from a contextual workspace event', async () => {
    render(<AdminAiChat />);

    act(() => window.dispatchEvent(new CustomEvent(ADMIN_AI_OPEN_EVENT)));

    expect(await screen.findByRole('dialog', { name: 'aiChat.title' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveFocus(),
    );
  });

  it('keeps completed background artifacts downloadable inside the assistant', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') {
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      }
      if (url === '/api/ai/history') {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 'export-job-1',
                queue: 'admin-product-export',
                kind: 'product-export',
                type: 'product_export',
                cancellable: true,
                status: 'completed',
                progress: { phase: 'completed', current: 1_402, total: 1_402, percentage: 100 },
                errorMessage: null,
                resultSummary: { fileName: 'meta-catalog.xlsx', totalProducts: 1_402 },
                downloadPath: 'https://files.example.test/meta-catalog.xlsx',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat permissions={['products_write']} />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.click(await screen.findByRole('button', { name: 'aiChat.downloadArtifact' }));

    expect(open).toHaveBeenCalledWith(
      'https://files.example.test/meta-catalog.xlsx',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('offers current-surface suggestions and sends the resolved context', async () => {
    const user = userEvent.setup();
    render(
      <AdminAiSurfaceProvider>
        <AdminAiChat permissions={['analytics_manage']} />
      </AdminAiSurfaceProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const suggestion = await screen.findByRole('button', {
      name: 'aiChat.surfaceSuggestions.summarizeCurrentAnalytics',
    });
    await user.click(suggestion);
    expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveValue(
      'aiChat.surfaceSuggestions.summarizeCurrentAnalytics',
    );
    expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveAttribute(
      'placeholder',
      'aiChat.surfacePlaceholders.stats',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    const chatCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/ai/chat');
    expect(JSON.parse(String(chatCall?.[1]?.body))).toMatchObject({
      context: {
        locale: 'en',
        surface: 'stats',
        section: 'storefront',
        pathname: '/en/stats/website',
        filters: { range: '90d', grain: 'week' },
      },
    });
  });

  it('sends from the keyboard and renders the response as a conversation', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const composer = await screen.findByRole('textbox', { name: 'aiChat.placeholder' });
    await user.type(composer, 'Find missing Arabic titles');
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByText('A reviewable proposal is ready.')).toBeInTheDocument();
    const chatCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/ai/chat');
    expect(chatCall?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(chatCall?.[1]?.body))).toEqual({
      message: 'Find missing Arabic titles',
      conversationKey: expect.any(String),
      autoAcceptProposals: false,
      model: 'gpt-5.6-luna',
      reasoningEffort: 'medium',
    });
    await waitFor(() => expect(composer).toHaveValue(''));
  });

  it('persists feedback on the exact assistant message', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(screen.getByRole('textbox', { name: 'aiChat.placeholder' }), 'Audit orders');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    const helpful = await screen.findByRole('button', { name: 'aiChat.helpful' });
    await user.click(helpful);

    expect(helpful).toHaveAttribute('aria-pressed', 'true');
    expect(fetch).toHaveBeenCalledWith('/api/ai/messages/71/feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback: 'helpful' }),
    });
  });

  it('resets an unavailable saved provider route to a supported model', async () => {
    window.localStorage.setItem(ADMIN_AI_MODEL_STORAGE_KEY, 'deepseek-v4-flash-fast');
    const user = userEvent.setup();
    render(<AdminAiChat modelIds={['deepseek-v4-flash', 'gpt-5.6-luna']} />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const model = screen.getByRole('combobox', { name: 'aiChat.model' });
    expect(model).toHaveValue('gpt-5.6-luna');
    expect(within(model).getAllByRole('option')).toHaveLength(2);
    expect(within(model).queryByRole('option', { name: /Fast/ })).not.toBeInTheDocument();
  });

  it('persists model and reasoning choices and sends them with the next request', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));

    const model = await screen.findByRole('combobox', { name: 'aiChat.model' });
    const effort = screen.getByRole('combobox', { name: 'aiChat.reasoningEffort' });
    const autoAccept = screen.getByRole('switch', { name: 'aiChat.autoAccept' });
    await user.selectOptions(model, 'gpt-5.6-luna');
    await user.selectOptions(effort, 'medium');
    await user.click(autoAccept);

    expect(window.localStorage.getItem(ADMIN_AI_MODEL_STORAGE_KEY)).toBe('gpt-5.6-luna');
    expect(window.localStorage.getItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY)).toBe('medium');
    expect(window.localStorage.getItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY)).toBe('true');
    expect(
      within(model).getByRole('option', { name: 'DeepSeek V4 Flash · $' }),
    ).toBeInTheDocument();
    expect(
      within(model).getByRole('option', { name: 'DeepSeek V4 Flash (Fast) · $$' }),
    ).toBeInTheDocument();
    expect(within(model).getByRole('option', { name: 'GPT-5.6 Luna · $$$' })).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'aiChat.placeholder' }),
      'Summarize the catalog',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    const chatCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/ai/chat');
    expect(JSON.parse(String(chatCall?.[1]?.body))).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoningEffort: 'medium',
      autoAcceptProposals: true,
    });
  });

  it('renders proposal review controls and applies the selected review action', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return chatResponse(
          JSON.stringify({
            message: 'A discount proposal is ready.',
            toolResults: [
              {
                type: 'tool-result',
                output: { id: 84, type: 'product_content', status: 'proposed' },
              },
            ],
            conversation: {
              id: 12,
              sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
              title: 'Discount proposal',
            },
          }),
          { status: 200 },
        );
      if (url === '/api/ai/proposals/84')
        return new Response(
          JSON.stringify({ proposal: { id: 84, status: 'applied', verified: true } }),
          { status: 200 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Suggest a discount',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    await user.click(await screen.findByRole('button', { name: 'aiChat.approve' }));
    const reviewCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === '/api/ai/proposals/84');
    expect(reviewCall?.[1]).toEqual(expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({ action: 'approve' });
    expect(await screen.findByText('aiChat.applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'aiChat.reject' })).not.toBeInTheDocument();
  });

  it('does not show completion when an approval response lacks persistence verification', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return chatResponse(
          JSON.stringify({
            message: 'A proposal is ready.',
            toolResults: [{ type: 'tool-result', output: { id: 93, status: 'proposed' } }],
            conversation: {
              id: 12,
              sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
              title: 'Verify proposal',
            },
          }),
          { status: 200 },
        );
      if (url === '/api/ai/proposals/93')
        return new Response(JSON.stringify({ proposal: { id: 93, status: 'applied' } }), {
          status: 200,
        });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Verify this proposal',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    await user.click(await screen.findByRole('button', { name: 'aiChat.approve' }));

    expect(await screen.findByText('aiChat.proposalVerificationError')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.applied')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'aiChat.approve' })).toBeInTheDocument();
  });

  it('renders streamed assistant text before tools and conversation metadata finish', async () => {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              controller = streamController;
              streamController.enqueue(
                encoder.encode(
                  '{"type":"status","status":"thinking"}\n{"type":"text-delta","delta":"Fast partial"}\n',
                ),
              );
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson' } },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Summarize performance',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('Fast partial')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.thinking')).not.toBeInTheDocument();
    await act(async () => {
      controller!.enqueue(
        encoder.encode(
          '{"type":"text-delta","delta":" response."}\n{"type":"result","toolResults":[],"conversation":{"id":22,"sessionKey":"e7249553-56ac-49f5-9e9c-dd8d724a6fac","title":"Summarize performance"}}\n',
        ),
      );
      controller!.close();
    });
    expect(await screen.findByText('Fast partial response.')).toBeInTheDocument();
  });
});
