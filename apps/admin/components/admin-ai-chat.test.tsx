import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY,
  ADMIN_AI_MODEL_STORAGE_KEY,
  ADMIN_AI_REASONING_EFFORT_STORAGE_KEY,
  AdminAiChat,
} from './admin-ai-chat';
import { AdminAiSurfaceProvider } from './admin-ai-surface-context';
import {
  ADMIN_AI_MUTATION_EVENT,
  ADMIN_AI_OPEN_EVENT,
  type AdminAiMutationEventDetail,
} from '../lib/admin-ai-events';

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

  it('shows localized live tool activity until the assistant starts answering', async () => {
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
                  '{"type":"status","status":"thinking"}\n{"type":"status","status":"working","toolName":"start_landing_page_work","phase":"running"}\n',
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
      'Create a launch landing page',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    const running = await screen.findByText('aiChat.toolActivity.running');
    expect(running.closest('[data-slot="admin-ai-activity"]')).toHaveAttribute(
      'data-phase',
      'running',
    );

    await act(async () => {
      controller!.enqueue(
        encoder.encode(
          '{"type":"status","status":"working","toolName":"start_landing_page_work","phase":"completed"}\n',
        ),
      );
    });
    const completed = await screen.findByText('aiChat.toolActivity.completed');
    expect(completed.closest('[data-slot="admin-ai-activity"]')).toHaveAttribute(
      'data-phase',
      'completed',
    );

    await act(async () => {
      controller!.enqueue(
        encoder.encode(
          '{"type":"text-delta","delta":"Landing page ready."}\n{"type":"result","toolResults":[],"conversation":{"id":23,"sessionKey":"e7249553-56ac-49f5-9e9c-dd8d724a6fac","title":"Launch landing page"}}\n',
        ),
      );
      controller!.close();
    });
    expect(await screen.findByText('Landing page ready.')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="admin-ai-activity"]')).not.toBeInTheDocument(),
    );
  });

  it('renders canonical Analytics metrics, source health, and data notes', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return chatResponse(
          JSON.stringify({
            message: 'Here is the current catalog performance.',
            toolResults: [
              {
                type: 'tool-result',
                toolName: 'query_analytics',
                output: {
                  kind: 'analytics_investigation',
                  comparisonStatus: 'aligned',
                  requestedRange: { startDate: '2026-06-01', endDate: '2026-08-23' },
                  commonEffectiveRange: { startDate: '2026-06-10', endDate: '2026-08-19' },
                  warning: 'Workspace values were recomputed over their shared effective range.',
                  results: [
                    {
                      kind: 'analytics',
                      query: 'catalog',
                      view: 'catalog',
                      filters: {
                        range: 'custom',
                        startDate: '2026-06-10',
                        endDate: '2026-08-19',
                        grain: 'week',
                      },
                      generatedAt: '2026-08-23T12:00:00.000Z',
                      metrics: [
                        {
                          key: 'paidUnits',
                          name: 'paidUnits',
                          value: 120,
                          previous: 100,
                          changePct: 20,
                          unit: 'number',
                          definition: 'Units attached to recognized paid outcomes.',
                          requestedRange: { startDate: '2026-06-10', endDate: '2026-08-19' },
                          effectiveRange: { startDate: '2026-06-10', endDate: '2026-08-19' },
                          dateBasis: 'Original first-posted cohort.',
                          asOf: '2026-08-19',
                          coveragePct: 92,
                          estimated: true,
                          warning: 'Uncovered economics use the canonical fallback margin.',
                        },
                      ],
                      focus: {
                        dimension: 'products',
                        definition: 'Canonical filtered product decision view.',
                        requestedRange: { startDate: '2026-06-10', endDate: '2026-08-19' },
                        effectiveRange: { startDate: '2026-06-10', endDate: '2026-08-19' },
                        dateBasis: 'Original first-posted cohort.',
                        totalSemantics: 'Do not sum visible rows into a headline total.',
                        available: 75,
                        matched: 1,
                        included: 1,
                        rows: [{ title: 'Hammer', paidUnits: 24 }],
                      },
                      data: {
                        kind: 'catalog',
                        metrics: [],
                      },
                      sources: [{ key: 'orders', state: 'current', coveragePct: 100 }],
                      warnings: [{ key: 'projectedCostCoverage', value: 92 }],
                    },
                  ],
                },
              },
              {
                type: 'tool-result',
                toolName: 'present_admin_ui',
                output: {
                  kind: 'admin_ui_blocks_v1',
                  blocks: [
                    {
                      kind: 'metrics',
                      toolName: 'query_analytics',
                      occurrence: 0,
                      keys: ['paidUnits'],
                    },
                    {
                      kind: 'source_health',
                      toolName: 'query_analytics',
                      occurrence: 0,
                      keys: ['orders'],
                    },
                    {
                      kind: 'records',
                      toolName: 'query_analytics',
                      occurrence: 0,
                      path: 'results[0].focus.rows',
                      columns: ['title', 'paidUnits'],
                      limit: 1,
                    },
                  ],
                },
              },
            ],
            conversation: {
              id: 30,
              sessionKey: 'd0ee26dc-26e6-4e55-a255-b84bad75e12a',
              title: 'Catalog performance',
            },
          }),
          { status: 200 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Summarize catalog performance',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect((await screen.findAllByText('paid units')).length).toBeGreaterThan(0);
    expect(screen.getByText('orders').parentElement).toHaveTextContent('orders · current · 100%');
    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Canonical filtered product decision view.')).not.toBeInTheDocument();
    expect(screen.queryByText(/aiChat.analyticsWarning/)).not.toBeInTheDocument();
  });

  it('renders only model-selected AI Stats blocks and keeps the full payload internal', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return Response.json({ conversations: [] });
      if (url === '/api/ai/chat') {
        return chatResponse({
          message: 'P95 latency is 950 ms for the selected period.',
          toolResults: [
            {
              type: 'tool-result',
              toolName: 'query_ai_stats',
              output: {
                kind: 'ai_stats',
                surface: 'operations',
                metrics: [
                  {
                    key: 'p95Latency',
                    name: 'p95Latency',
                    value: 950,
                    unit: 'milliseconds',
                  },
                ],
                data: {
                  kind: 'operations',
                  metrics: [],
                  workflows: [{ task: 'SENSITIVE_FULL_PAYLOAD', runs: 12 }],
                },
              },
            },
            {
              type: 'tool-result',
              toolName: 'present_admin_ui',
              output: {
                kind: 'admin_ui_blocks_v1',
                blocks: [
                  {
                    kind: 'metrics',
                    toolName: 'query_ai_stats',
                    occurrence: 0,
                    keys: ['p95Latency'],
                  },
                ],
              },
            },
          ],
          conversation: {
            id: 33,
            sessionKey: '56678c51-b376-43f0-b43d-d5995dd6784a',
            title: 'AI reliability',
          },
        });
      }
      return Response.json({});
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Show assistant P95 latency',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('950 ms')).toBeInTheDocument();
    expect(screen.queryByText('SENSITIVE_FULL_PAYLOAD')).not.toBeInTheDocument();
  });

  it('keeps raw read evidence internal when the model did not select a UI block', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations') return Response.json({ conversations: [] });
      if (url === '/api/ai/chat') {
        return chatResponse({
          message: 'Thirteen posted orders are missing a canonical EcoTrack state.',
          toolResults: [
            {
              type: 'tool-result',
              toolName: 'inspect_orders',
              output: {
                items: [{ id: 991, publicToken: 'RAW-READ-EVIDENCE' }],
                pagination: { page: 1, totalItems: 808 },
              },
            },
          ],
          conversation: {
            id: 31,
            sessionKey: 'a55f9ee5-9a21-4ceb-ab29-25fce3740e5b',
            title: 'EcoTrack coverage',
          },
        });
      }
      return Response.json({});
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'aiChat.placeholder' }),
      'Explain the EcoTrack coverage gap',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(
      await screen.findByText('Thirteen posted orders are missing a canonical EcoTrack state.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('RAW-READ-EVIDENCE')).not.toBeInTheDocument();
    expect(screen.queryByText('aiChat.toolLabels.orders')).not.toBeInTheDocument();
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
