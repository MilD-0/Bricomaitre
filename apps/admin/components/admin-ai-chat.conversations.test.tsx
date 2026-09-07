import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

  it('marks partial provider output as interrupted instead of presenting it as complete', async () => {
    const mutationListener = vi.fn();
    window.addEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/history')
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
          [
            JSON.stringify({ type: 'status', status: 'thinking' }),
            JSON.stringify({ type: 'text-delta', delta: 'The order was' }),
            JSON.stringify({
              type: 'error',
              code: 'admin_ai_failed',
              message: 'The order was\n\nThis response stopped before completion.',
              conversation: {
                id: 12,
                sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
                title: 'Update the order',
              },
              messageId: 72,
              toolResults: [
                {
                  type: 'tool-result',
                  toolName: 'update_order_status',
                  output: { items: [{ orderId: 91, statusLabel: 'confirmed' }] },
                },
              ],
            }),
            '',
          ].join('\n'),
          { headers: { 'content-type': 'application/x-ndjson' } },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Update the order',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('The order was')).toBeInTheDocument();
    expect(await screen.findByText('This response stopped before completion.')).toBeInTheDocument();
    expect(await screen.findByText('aiChat.toolLabels.ordersUpdated')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.error')).not.toBeInTheDocument();
    expect(mutationListener).toHaveBeenCalledOnce();
    expect(
      (mutationListener.mock.calls[0]?.[0] as CustomEvent<AdminAiMutationEventDetail>).detail,
    ).toEqual({ toolNames: ['update_order_status'] });
    window.removeEventListener(ADMIN_AI_MUTATION_EVENT, mutationListener);
  });

  it('renders assistant Markdown using the bulletin post formatting', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history')) {
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      }
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return chatResponse(
        JSON.stringify({
          message: 'I can help with:\n\n- **Product searches** by title\n- `SKU` checks',
          toolResults: {},
          conversation: {
            id: 12,
            sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
            title: 'Help me',
          },
        }),
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(await screen.findByRole('textbox', { name: 'aiChat.placeholder' }), 'Help me');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('Product searches', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('SKU', { selector: 'code' })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) => node?.tagName === 'LI' && node.textContent === 'Product searches by title',
      ),
    ).toBeInTheDocument();
    const message = screen
      .getByText('Product searches', { selector: 'strong' })
      .closest('[data-slot="admin-ai-assistant-message"]');
    expect(message).toHaveClass('min-w-0', 'w-full', 'flex-1', 'overflow-hidden');
    expect(message?.firstElementChild).toHaveClass(
      'min-w-0',
      'max-w-[75ch]',
      'overflow-hidden',
      '[overflow-wrap:anywhere]',
    );
  });

  it('keeps Markdown tables inside the assistant reading width and wraps their cells', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/history') return Response.json({ jobs: [] });
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return chatResponse(
        JSON.stringify({
          message:
            '| Product | Details |\n| --- | --- |\n| Drill | Extraordinarily-long-unbroken-compatibility-reference |',
          toolResults: {},
          conversation: {
            id: 12,
            sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
            title: 'Compare products',
          },
        }),
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Compare products',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    const table = await screen.findByRole('table');
    expect(table).toHaveClass('w-full', 'min-w-[28rem]');
    expect(table.parentElement).toHaveClass('max-w-full', 'overflow-x-auto');
    expect(screen.getByText('Extraordinarily-long-unbroken-compatibility-reference')).toHaveClass(
      '[overflow-wrap:anywhere]',
    );
  });

  it('restores an account conversation and starts a separate new chat', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history'))
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      if (url === '/api/ai/conversations')
        return new Response(
          JSON.stringify({
            conversations: [
              {
                id: 44,
                sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242',
                title: 'Saved catalog chat',
              },
            ],
          }),
          { status: 200 },
        );
      if (url === '/api/ai/conversations/44')
        return new Response(
          JSON.stringify({
            messages: [
              { role: 'user', content: 'Saved question' },
              {
                role: 'assistant',
                content: 'Saved answer',
                messageRecordId: 71,
                feedback: 'helpful',
                toolResults: [
                  {
                    type: 'tool-result',
                    toolName: 'inspect_inventory',
                    output: {
                      total: 1,
                      items: [{ sku: 'SKU-1', title: 'Saved drill', quantity: 4 }],
                    },
                  },
                  {
                    type: 'tool-result',
                    toolName: 'present_admin_ui',
                    output: {
                      kind: 'admin_ui_blocks_v1',
                      blocks: [
                        {
                          kind: 'records',
                          toolName: 'inspect_inventory',
                          occurrence: 0,
                          path: 'items',
                          columns: ['sku', 'title', 'quantity'],
                          limit: 5,
                        },
                      ],
                    },
                  },
                ],
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
    expect(await screen.findByText('Saved answer')).toBeInTheDocument();
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'aiChat.helpful' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Saved catalog chat' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'aiChat.newChat' }));
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
    expect(screen.getByText('aiChat.emptyTitle')).toBeInTheDocument();
  });

  it('searches, renames, and deletes saved conversations', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/ai/history'))
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      if (url.startsWith('/api/ai/conversations?') || url === '/api/ai/conversations')
        return new Response(
          JSON.stringify({
            conversations: [
              {
                id: 44,
                sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242',
                title: 'Saved catalog chat',
              },
            ],
          }),
          { status: 200 },
        );
      if (url === '/api/ai/conversations/44' && init?.method === 'PATCH')
        return new Response(
          JSON.stringify({
            conversation: {
              id: 44,
              sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242',
              title: 'Weekly catalog review',
            },
          }),
          { status: 200 },
        );
      if (url === '/api/ai/conversations/44' && init?.method === 'DELETE')
        return Response.json({ deleted: true, id: 44 });
      if (url === '/api/ai/conversations/44')
        return Response.json({ messages: [{ role: 'assistant', content: 'Saved answer' }] });
      return new Response('{}', { status: 200 });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await screen.findByText('Saved answer');
    await user.type(screen.getByRole('textbox', { name: 'aiChat.searchChats' }), 'Arabic title');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ai/conversations?q=Arabic%20title',
        expect.objectContaining({ cache: 'no-store' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'aiChat.renameChat Saved catalog chat' }));
    const rename = screen.getByRole('textbox', { name: 'aiChat.renameChat' });
    await user.clear(rename);
    await user.type(rename, 'Weekly catalog review');
    await user.click(screen.getByRole('button', { name: 'aiChat.saveChatTitle' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ai/conversations/44',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'Weekly catalog review' }),
        }),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'aiChat.deleteChat Weekly catalog review' }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/conversations/44', { method: 'DELETE' }),
    );
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
  });

  it('shows loading states and never lets a slower previous chat replace the active chat', async () => {
    let resolveFirstChat: ((response: Response) => void) | undefined;
    const firstChatResponse = new Promise<Response>((resolve) => {
      resolveFirstChat = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(
          JSON.stringify({
            conversations: [
              { id: 1, sessionKey: 'ef9498fb-5c5a-441c-99f6-0d695544cf38', title: 'First chat' },
              { id: 2, sessionKey: 'd222fcb4-af58-47fc-867f-36cda4b815ad', title: 'Second chat' },
            ],
          }),
          { status: 200 },
        );
      if (url === '/api/ai/conversations/1') return firstChatResponse;
      if (url === '/api/ai/conversations/2')
        return new Response(
          JSON.stringify({ messages: [{ role: 'assistant', content: 'Second chat answer' }] }),
          { status: 200 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('aiChat.loadingMessages')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Second chat' }));
    expect(await screen.findByText('Second chat answer')).toBeInTheDocument();

    resolveFirstChat?.(
      new Response(
        JSON.stringify({ messages: [{ role: 'assistant', content: 'Stale first answer' }] }),
        { status: 200 },
      ),
    );
    await waitFor(() => expect(screen.queryByText('Stale first answer')).not.toBeInTheDocument());
    expect(screen.getByText('Second chat answer')).toBeInTheDocument();
  });
});
