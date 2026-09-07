import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAiChat } from './admin-ai-chat';

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

  it('retries a failed conversation load without losing a draft', async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return Response.json({
          conversations: [
            { id: 44, sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242', title: 'Saved chat' },
          ],
        });
      if (url === '/api/ai/conversations/44') {
        if (++attempts === 1) throw new Error('Network unavailable');
        return Response.json({
          messages: [{ role: 'assistant', content: 'Recovered saved answer' }],
        });
      }
      return Response.json({ jobs: [] });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await screen.findByText('aiChat.conversationLoadError');
    const composer = screen.getByRole('textbox', { name: 'aiChat.placeholder' });
    await user.type(composer, 'Unsent follow-up');
    expect(screen.getByRole('button', { name: 'aiChat.send' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'aiChat.retryLoad' }));
    await screen.findByText('Recovered saved answer');
    expect(composer).toHaveValue('Unsent follow-up');
    expect(screen.getByRole('button', { name: 'aiChat.send' })).toBeEnabled();
  });

  it('offers a working sidebar retry when the saved chat list cannot load', async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input) === '/api/ai/conversations') {
        if (++attempts === 1) throw new Error('Network unavailable');
        return Response.json({
          conversations: [
            { id: 44, sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242', title: 'Recovered chat' },
          ],
        });
      }
      return Response.json({ jobs: [] });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await screen.findByText('aiChat.historyLoadError');
    await user.click(screen.getByRole('button', { name: 'aiChat.retryLoad' }));
    await screen.findByRole('button', { name: 'Recovered chat' });
    expect(screen.queryByText('aiChat.historyLoadError')).not.toBeInTheDocument();
  });

  it('shows a sidebar status while saved chats are loading', async () => {
    let resolveChats: ((response: Response) => void) | undefined;
    const chatsResponse = new Promise<Response>((resolve) => {
      resolveChats = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      if (String(input) === '/api/ai/conversations') return chatsResponse;
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('aiChat.loadingChats')).toBeInTheDocument();
    resolveChats?.(new Response(JSON.stringify({ conversations: [] }), { status: 200 }));
    expect(await screen.findByText('aiChat.noChats')).toBeInTheDocument();
  });

  it('shows catalog categorization progress and sends queue-specific cancellation', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/history')
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 'categorize-1',
                queue: 'admin-ai-categorization',
                kind: 'ai-product-categorization',
                status: 'running',
                progress: {
                  phase: 'classifying-products',
                  current: 40,
                  total: 100,
                  percentage: 40,
                },
                errorMessage: null,
                resultSummary: { applied: 12, proposed: 8, unchanged: 10, ambiguous: 7, failed: 3 },
              },
            ],
          }),
          { status: 200 },
        );
      if (url === '/api/ai/jobs/cancel')
        return new Response(JSON.stringify({ job: { id: 'categorize-1', status: 'cancelled' } }), {
          status: 200,
        });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('aiChat.jobLabels.ai_categorization')).toBeInTheDocument();
    expect(screen.getByText('40/100 · classifying products')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'aiChat.cancel' }));

    const cancelCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === '/api/ai/jobs/cancel');
    expect(JSON.parse(String(cancelCall?.[1]?.body))).toEqual({ kind: 'categorization' });
  });

  it('shows every permitted background domain and navigates jobs as a stacked card carousel', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/history')
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 'categorize-1',
                queue: 'admin-ai-categorization',
                kind: 'ai-product-categorization',
                status: 'running',
                progress: {
                  phase: 'classifying-products',
                  current: 40,
                  total: 100,
                  percentage: 40,
                },
                errorMessage: null,
                resultSummary: null,
              },
              {
                id: 'content-1',
                queue: 'admin-ai-content',
                kind: 'ai-product-content',
                status: 'queued',
                progress: { phase: 'queued', current: 0, total: 80, percentage: 0 },
                errorMessage: null,
                resultSummary: null,
              },
              {
                id: 'ecotrack-1',
                queue: 'admin-ecotrack-sync',
                kind: 'admin-ecotrack-sync',
                type: 'ecotrack_catalog_sync',
                status: 'running',
                progress: { phase: 'syncing', current: 5, total: 20, percentage: 25 },
                errorMessage: null,
                resultSummary: null,
              },
            ],
          }),
          { status: 200 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('aiChat.jobLabels.ai_categorization')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.jobLabels.ai_content')).not.toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'aiChat.nextJob' }));
    expect(await screen.findByText('aiChat.jobLabels.ai_content')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.jobLabels.ai_categorization')).not.toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'aiChat.nextJob' }));
    expect(await screen.findByText('aiChat.jobLabels.ecotrack_catalog_sync')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'aiChat.previousJob' }));
    expect(await screen.findByText('aiChat.jobLabels.ai_content')).toBeInTheDocument();
  });

  it('sends exact server job cancellation for system-wide tasks', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/history')
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: '3c2e0103-ce88-4b4b-b185-f46ed298fe27',
                queue: 'admin-ai-categorization',
                kind: 'ai-product-categorization',
                type: 'ai_categorization',
                cancellable: true,
                status: 'running',
                progress: { phase: 'classifying-products', current: 8, total: 1618, percentage: 1 },
                errorMessage: null,
                resultSummary: null,
              },
            ],
          }),
          { status: 200 },
        );
      if (url === '/api/ai/jobs/cancel')
        return new Response(JSON.stringify({ job: { status: 'running', cancelRequested: true } }), {
          status: 200,
        });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.click(await screen.findByRole('button', { name: 'aiChat.cancel' }));

    const cancelCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === '/api/ai/jobs/cancel');
    expect(JSON.parse(String(cancelCall?.[1]?.body))).toEqual({
      type: 'ai_categorization',
      jobId: '3c2e0103-ce88-4b4b-b185-f46ed298fe27',
    });
  });
});

it('preserves an unsent draft when searching saved conversations', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/ai/conversations?')) return Response.json({ conversations: [] });
      if (url === '/api/ai/conversations')
        return Response.json({
          conversations: [
            { id: 12, sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac', title: 'Saved' },
          ],
        });
      if (url === '/api/ai/conversations/12')
        return Response.json({ messages: [{ role: 'assistant', content: 'Saved answer' }] });
      return Response.json({ jobs: [] });
    }),
  );
  const user = userEvent.setup();
  render(<AdminAiChat />);
  await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
  await screen.findByText('Saved answer');
  const composer = screen.getByRole('textbox', { name: 'aiChat.placeholder' });
  await user.type(composer, 'Unsent draft');
  await user.type(screen.getByRole('textbox', { name: 'aiChat.searchChats' }), 'another chat');
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('?q='), expect.anything()),
  );
  expect(composer).toHaveValue('Unsent draft');
});

it.each([0, 5])(
  'reconciles terminal messages after %s HTTP failures without replacing the active turn',
  async (failedReads) => {
    let terminal = false;
    let remainingFailures = failedReads;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const conversation = {
      id: 12,
      sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
      title: 'Saved',
    };
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) + '\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === '/api/ai/conversations')
          return Response.json({ conversations: [conversation] });
        if (url === '/api/ai/conversations/12' && terminal && remainingFailures-- > 0)
          return new Response(null, { status: 503 });
        if (url === '/api/ai/conversations/12')
          return Response.json({
            messages: [
              { role: 'assistant', content: 'Saved answer', messageRecordId: 1 },
              ...(terminal
                ? [
                    {
                      role: 'assistant',
                      content: 'Task completed',
                      terminal: true,
                      jobId: 'background',
                      messageRecordId: 2,
                    },
                  ]
                : []),
            ],
          });
        if (url === '/api/ai/history')
          return Response.json({
            jobs: [
              {
                id: 'background',
                conversationId: 12,
                kind: 'ai-product-content',
                status: terminal ? 'completed' : 'running',
                progress: { phase: 'generating', current: 0, total: 1, percentage: 0 },
              },
            ],
          });
        if (url === '/api/ai/chat')
          return new Response(
            new ReadableStream({
              start(value) {
                controller = value;
                value.enqueue(encode({ type: 'text-delta', delta: 'First part' }));
              },
            }),
            { headers: { 'content-type': 'application/x-ndjson' } },
          );
        return Response.json({});
      }),
    );
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await screen.findByText('Saved answer');
    await user.type(screen.getByRole('textbox', { name: 'aiChat.placeholder' }), 'A new turn');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    await screen.findByText('First part');
    terminal = true;
    await screen.findByText('Task completed', {}, { timeout: 9000 });
    expect(screen.getByText('First part')).toBeInTheDocument();
    expect(screen.getByText('A new turn')).toBeInTheDocument();
    await act(async () => {
      controller!.enqueue(encode({ type: 'text-delta', delta: ' and last part.' }));
      controller!.enqueue(encode({ type: 'result', toolResults: [], conversation, messageId: 3 }));
      controller!.close();
    });
    expect(await screen.findByText('First part and last part.')).toBeInTheDocument();
    expect(screen.getAllByText('Task completed')).toHaveLength(1);
  },
  15000,
);
