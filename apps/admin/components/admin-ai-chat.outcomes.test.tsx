import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_AI_MUTATION_EVENT, type AdminAiMutationEventDetail } from '../lib/admin-ai-events';
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

  it('presents persisted tool actions with a human outcome and exact workspace handoff', async () => {
    const mutationListener = vi.fn();
    window.addEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return chatResponse({
          message: 'Landing page 91 is now unpublished.',
          toolResults: [
            {
              type: 'tool-result',
              toolName: 'set_landing_page_active',
              output: {
                ok: true,
                id: 91,
                productId: 12,
                locale: 'fr',
                active: false,
                currentRevision: 1,
              },
            },
          ],
          conversation: {
            id: 31,
            sessionKey: '182ffc13-33e5-43b7-a064-e4c437b0ea67',
            title: 'Unpublish landing page',
          },
        });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-slot="admin-ai-workspace"]')).toHaveClass(
      'isolate',
      'min-w-0',
      'w-full',
      'overflow-hidden',
    );
    expect(dialog.querySelector('[data-slot="admin-ai-conversation"]')).toHaveClass(
      'isolate',
      'min-w-0',
      'overflow-hidden',
    );
    expect(dialog.querySelector('[data-slot="admin-ai-sidebar"]')).toHaveClass('min-w-0');
    const conversationTab = screen.getByRole('button', { name: 'aiChat.conversationTab' });
    const chatsTab = screen.getByRole('button', { name: 'aiChat.chats' });
    expect(conversationTab).toHaveAttribute('aria-pressed', 'true');
    expect(chatsTab).toHaveAttribute('aria-pressed', 'false');
    await user.click(chatsTab);
    expect(dialog.querySelector('[data-slot="admin-ai-conversation"]')).toHaveClass('hidden');
    expect(dialog.querySelector('[data-slot="admin-ai-sidebar"]')).not.toHaveClass('hidden');
    await user.click(conversationTab);
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Unpublish landing page 91',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('aiChat.toolLabels.landingPageUpdated')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'aiChat.toolDestinations.landingPages' }),
    ).toHaveAttribute('href', '/en/assets/landing-pages/91');
    expect(screen.getByText('set landing page active')).toBeInTheDocument();
    expect(mutationListener).toHaveBeenCalledOnce();
    expect(
      (mutationListener.mock.calls[0]?.[0] as CustomEvent<AdminAiMutationEventDetail>).detail,
    ).toEqual({ toolNames: ['set_landing_page_active'] });
    window.removeEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
  });

  it('reconciles terminal EcoTrack jobs into the same chat and offers repair and retry drafts', async () => {
    let chatCompleted = false;
    const mutationListener = vi.fn();
    window.addEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') {
        return Response.json({ conversations: [] });
      }
      if (url === '/api/ai/chat') {
        chatCompleted = true;
        return chatResponse({
          message: 'The EcoTrack job is queued.',
          toolResults: [],
          conversation: {
            id: 52,
            sessionKey: '0d88ac77-a633-4fab-a216-73cb83682b78',
            title: 'Post confirmed orders',
          },
        });
      }
      if (url === '/api/ai/history') {
        return Response.json({
          jobs: chatCompleted
            ? [
                {
                  id: 'ecotrack-52',
                  queue: 'admin-order-ecotrack',
                  kind: 'order-ecotrack:selected',
                  conversationId: 52,
                  status: 'completed',
                  progress: { phase: 'completed', current: 3, total: 3, percentage: 100 },
                  errorMessage: null,
                  resultSummary: { created: 1, invalid: 1, failed: 1 },
                },
              ]
            : [],
        });
      }
      if (url === '/api/ai/conversations/52') {
        return Response.json({
          messages: [
            { role: 'user', content: 'Post orders 11, 12 and 13 via Emir.' },
            {
              role: 'assistant',
              content: 'Terminal EcoTrack result.',
              terminal: true,
              jobId: 'ecotrack-52',
              toolResults: [
                {
                  type: 'tool-result',
                  toolName: 'ecotrack_posting_terminal',
                  output: {
                    kind: 'ecotrack_posting_terminal',
                    outcomeClassificationVersion: 1,
                    provider: 'emir',
                    attemptNumber: 2,
                    retryCount: 1,
                    successes: [
                      {
                        orderId: 11,
                        reference: '11',
                        tracking: 'EM-11',
                        message: 'Created successfully.',
                      },
                    ],
                    validationFailures: [
                      {
                        orderId: 12,
                        reference: '12',
                        tracking: null,
                        message: 'Commune is missing.',
                      },
                    ],
                    providerRejections: [
                      {
                        orderId: 13,
                        reference: '13',
                        tracking: null,
                        message: 'Telephone rejected.',
                      },
                    ],
                    alreadyPosted: [],
                    repairableOrderIds: [12, 13],
                    retryableOrderIds: [13],
                  },
                },
              ],
            },
          ],
        });
      }
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat permissions={['orders_write']} />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Post orders 11, 12 and 13 via Emir.',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('Terminal EcoTrack result.')).toBeInTheDocument();
    expect(screen.getByText('aiChat.ecotrackTerminal.successes')).toBeInTheDocument();
    expect(screen.getByText('EM-11', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Commune is missing.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Telephone rejected.', { exact: false })).toBeInTheDocument();
    expect(mutationListener).toHaveBeenCalledOnce();
    expect(
      (mutationListener.mock.calls[0]?.[0] as CustomEvent<AdminAiMutationEventDetail>).detail,
    ).toEqual({ toolNames: ['post_orders_to_ecotrack'] });

    await user.click(screen.getByRole('button', { name: 'aiChat.ecotrackTerminal.repair' }));
    expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveValue(
      'aiChat.ecotrackTerminal.repairPrompt',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.ecotrackTerminal.retry' }));
    expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveValue(
      'aiChat.ecotrackTerminal.retryPrompt',
    );
    window.removeEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
  });

  it('lets the user abort an in-flight assistant response without showing a failure', async () => {
    let capturedSignal: AbortSignal | null = null;
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/ai/conversations')
          return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
        if (url === '/api/ai/history')
          return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
        if (url === '/api/ai/chat') {
          capturedSignal = init?.signal as AbortSignal;
          return new Promise<Response>((_resolve, reject) => {
            capturedSignal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          });
        }
        return new Response('{}', { status: 200 });
      },
    );
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Keep thinking',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    await user.click(await screen.findByRole('button', { name: 'aiChat.stopResponse' }));

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'aiChat.send' })).toBeInTheDocument(),
    );
    expect(screen.queryByText('aiChat.error')).not.toBeInTheDocument();
  });

  it.each(['new', 'saved'])(
    'detaches an old stream when navigating to a %s chat',
    async (destination) => {
      const conversations = [
        { id: 1, sessionKey: 'ef9498fb-5c5a-441c-99f6-0d695544cf38', title: 'First chat' },
        { id: 2, sessionKey: 'd222fcb4-af58-47fc-867f-36cda4b815ad', title: 'Second chat' },
      ];
      let controller: ReadableStreamDefaultController<Uint8Array>;
      let signal: AbortSignal | undefined;
      let turn = 0;
      const encode = (event: unknown) => new TextEncoder().encode(JSON.stringify(event) + '\n');
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/ai/conversations') return Response.json({ conversations });
        if (url === '/api/ai/conversations/1')
          return Response.json({
            messages: [{ role: 'assistant', content: 'First saved answer' }],
          });
        if (url === '/api/ai/conversations/2')
          return Response.json({
            messages: [{ role: 'assistant', content: 'Second saved answer' }],
          });
        if (url === '/api/ai/history') return Response.json({ jobs: [] });
        if (url === '/api/ai/chat' && ++turn === 1) {
          signal = init?.signal as AbortSignal;
          return new Response(
            new ReadableStream({
              start(value) {
                controller = value;
                value.enqueue(encode({ type: 'text-delta', delta: 'Old partial answer' }));
              },
            }),
            { headers: { 'content-type': 'application/x-ndjson' } },
          );
        }
        if (url === '/api/ai/chat')
          return chatResponse({
            message: 'New turn answer',
            toolResults: [],
            conversation: conversations[1],
          });
        return Response.json({});
      });
      const user = userEvent.setup();
      render(<AdminAiChat />);
      await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
      await screen.findByText('First saved answer');
      await user.type(screen.getByRole('textbox', { name: 'aiChat.placeholder' }), 'First request');
      await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
      await screen.findByText('Old partial answer');
      await user.click(
        screen.getByRole('button', {
          name: destination === 'new' ? 'aiChat.newChat' : 'Second chat',
        }),
      );
      if (destination === 'saved') await screen.findByText('Second saved answer');
      expect(signal?.aborted).toBe(true);
      await user.type(screen.getByRole('textbox', { name: 'aiChat.placeholder' }), 'New draft');
      await act(async () => {
        controller!.enqueue(encode({ type: 'text-delta', delta: ' stale tail' }));
        controller!.enqueue(
          encode({ type: 'result', toolResults: [], conversation: conversations[0] }),
        );
        controller!.close();
      });
      expect(screen.queryByText(/Old partial answer|stale tail/)).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveValue('New draft');
      await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
      await screen.findByText('New turn answer');
      const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === '/api/ai/chat');
      const key = JSON.parse(String(calls[1]?.[1]?.body)).conversationKey;
      if (destination === 'saved') expect(key).toBe(conversations[1]!.sessionKey);
      else expect(key).not.toBe(conversations[0]!.sessionKey);
    },
  );

  it('keeps a completed answer successful when sidebar refresh fails', async () => {
    let completed = false;
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/ai/chat') completed = true;
      if (completed && (url === '/api/ai/conversations' || url === '/api/ai/history'))
        throw new Error('Refresh unavailable');
      return originalFetch(input, init);
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await screen.findByText('aiChat.noChats');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/ai/history', expect.anything()));
    await user.type(screen.getByRole('textbox', { name: 'aiChat.placeholder' }), 'Answer this');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));
    await screen.findByText('A reviewable proposal is ready.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'aiChat.send' })).toBeInTheDocument(),
    );
    expect(screen.queryByText('aiChat.interrupted')).not.toBeInTheDocument();
    expect(screen.queryByText('aiChat.error')).not.toBeInTheDocument();
  });
});
