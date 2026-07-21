import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAiChat, selectAnalyticsChartMetric } from './admin-ai-chat';

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
      if (url === '/api/ai/conversations') {
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      }
      if (url.includes('/api/ai/chat')) {
        return new Response(JSON.stringify({ message: 'A reviewable proposal is ready.', toolResults: {}, conversation: { id: 12, sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac', title: 'Find missing Arabic titles' } }), { status: 200 });
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
    expect(within(dialog).getByRole('complementary', { name: 'aiChat.chats' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'aiChat.close' })).toBeInTheDocument();
    expect(within(dialog).queryByText('aiChat.reviewMode')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('aiChat.description')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('aiChat.sendHint')).not.toBeInTheDocument();
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
    });
    await waitFor(() => expect(composer).toHaveValue(''));
  });

  it('renders proposal review controls and applies the selected review action', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat') return new Response(JSON.stringify({
        message: 'A discount proposal is ready.',
        toolResults: [{ type: 'tool-result', output: { id: 84, type: 'product_discount', status: 'proposed' } }],
        conversation: { id: 12, sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac', title: 'Discount proposal' },
      }), { status: 200 });
      if (url === '/api/ai/proposals/84') return new Response(JSON.stringify({ proposal: { id: 84, status: 'applied' } }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(await screen.findByRole('textbox', { name: 'aiChat.placeholder' }), 'Suggest a discount');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    await user.click(await screen.findByRole('button', { name: 'aiChat.approve' }));
    const reviewCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/ai/proposals/84');
    expect(reviewCall?.[1]).toEqual(expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({ action: 'approve' });
    expect(await screen.findByText('aiChat.applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'aiChat.reject' })).not.toBeInTheDocument();
  });

  it('renders streamed assistant text before tools and conversation metadata finish', async () => {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat') return new Response(new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          streamController.enqueue(encoder.encode('{"type":"status","status":"thinking"}\n{"type":"text-delta","delta":"Fast partial"}\n'));
        },
      }), { headers: { 'content-type': 'application/x-ndjson' } });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(await screen.findByRole('textbox', { name: 'aiChat.placeholder' }), 'Summarize performance');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('Fast partial')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.thinking')).not.toBeInTheDocument();
    await act(async () => {
      controller!.enqueue(encoder.encode('{"type":"text-delta","delta":" response."}\n{"type":"result","toolResults":[],"conversation":{"id":22,"sessionKey":"e7249553-56ac-49f5-9e9c-dd8d724a6fac","title":"Summarize performance"}}\n'));
      controller!.close();
    });
    expect(await screen.findByText('Fast partial response.')).toBeInTheDocument();
  });

  it('renders assistant Markdown using the bulletin post formatting', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history')) {
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      }
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return new Response(JSON.stringify({
        message: 'I can help with:\n\n- **Product searches** by title\n- `SKU` checks',
        toolResults: {},
        conversation: { id: 12, sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac', title: 'Help me' },
      }), { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(await screen.findByRole('textbox', { name: 'aiChat.placeholder' }), 'Help me');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('Product searches', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('SKU', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.tagName === 'LI' && node.textContent === 'Product searches by title')).toBeInTheDocument();
    const bubble = screen.getByText('Product searches', { selector: 'strong' }).closest('[data-slot="admin-ai-assistant-bubble"]');
    expect(bubble).toHaveClass('min-w-0', 'w-full', 'max-w-[42rem]', 'overflow-hidden');
    expect(bubble?.firstElementChild).toHaveClass('min-w-0', 'max-w-full', 'overflow-hidden', '[overflow-wrap:anywhere]');
  });

  it('keeps Markdown tables inside the assistant reading width and wraps their cells', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return new Response(JSON.stringify({
        message: '| Product | Details |\n| --- | --- |\n| Drill | Extraordinarily-long-unbroken-compatibility-reference |',
        toolResults: {},
        conversation: { id: 12, sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac', title: 'Compare products' },
      }), { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(await screen.findByRole('textbox', { name: 'aiChat.placeholder' }), 'Compare products');
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    const table = await screen.findByRole('table');
    expect(table).toHaveClass('w-full', 'max-w-full', 'table-fixed');
    expect(screen.getByText('Extraordinarily-long-unbroken-compatibility-reference')).toHaveClass('[overflow-wrap:anywhere]');
  });

  it('restores an account conversation and starts a separate new chat', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history')) return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [{ id: 44, sessionKey: '0afc0dac-dc87-40b0-b659-b83170a11242', title: 'Saved catalog chat' }] }), { status: 200 });
      if (url === '/api/ai/conversations/44') return new Response(JSON.stringify({ messages: [{ role: 'user', content: 'Saved question' }, { role: 'assistant', content: 'Saved answer' }] }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('Saved answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved catalog chat' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'aiChat.newChat' }));
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
    expect(screen.getByText('aiChat.emptyTitle')).toBeInTheDocument();
  });

  it('shows loading states and never lets a slower previous chat replace the active chat', async () => {
    let resolveFirstChat: ((response: Response) => void) | undefined;
    const firstChatResponse = new Promise<Response>((resolve) => { resolveFirstChat = resolve; });
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return new Response(JSON.stringify({ conversations: [
        { id: 1, sessionKey: 'ef9498fb-5c5a-441c-99f6-0d695544cf38', title: 'First chat' },
        { id: 2, sessionKey: 'd222fcb4-af58-47fc-867f-36cda4b815ad', title: 'Second chat' },
      ] }), { status: 200 });
      if (url === '/api/ai/conversations/1') return firstChatResponse;
      if (url === '/api/ai/conversations/2') return new Response(JSON.stringify({ messages: [{ role: 'assistant', content: 'Second chat answer' }] }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByText('aiChat.loadingMessages')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Second chat' }));
    expect(await screen.findByText('Second chat answer')).toBeInTheDocument();

    resolveFirstChat?.(new Response(JSON.stringify({ messages: [{ role: 'assistant', content: 'Stale first answer' }] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByText('Stale first answer')).not.toBeInTheDocument());
    expect(screen.getByText('Second chat answer')).toBeInTheDocument();
  });

  it('shows a sidebar status while saved chats are loading', async () => {
    let resolveChats: ((response: Response) => void) | undefined;
    const chatsResponse = new Promise<Response>((resolve) => { resolveChats = resolve; });
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
});

describe('selectAnalyticsChartMetric', () => {
  it('prefers a populated metric over an earlier all-zero metric', () => {
    const rows = [
      { name: 'A', purchases: 0, views: 12 },
      { name: 'B', purchases: 0, views: 7 },
    ];

    expect(selectAnalyticsChartMetric(rows, ['name', 'purchases', 'views'])).toBe('views');
  });

  it('does not render a misleading empty bar chart when every metric is zero', () => {
    expect(selectAnalyticsChartMetric([{ title: 'A', orders: 0 }], ['title', 'orders'])).toBeNull();
  });
});
