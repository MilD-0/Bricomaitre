import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY,
  ADMIN_AI_MODEL_STORAGE_KEY,
  ADMIN_AI_REASONING_EFFORT_STORAGE_KEY,
  AdminAiChat,
  analyticsChartRows,
  selectAnalyticsChartMetric,
} from './admin-ai-chat';
import { AdminAiSurfaceProvider } from './admin-ai-surface-context';
import { ADMIN_AI_OPEN_EVENT } from '../lib/admin-ai-events';

const navigation = vi.hoisted(() => ({ pathname: '/en/stats/website' }));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams('range=90d&grain=week'),
}));

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
          return new Response(
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
    expect(within(dialog).getByRole('switch', { name: 'aiChat.autoAccept' })).not.toBeChecked();
  });

  it('opens from a contextual workspace event', async () => {
    render(<AdminAiChat />);

    act(() => window.dispatchEvent(new CustomEvent(ADMIN_AI_OPEN_EVENT)));

    expect(await screen.findByRole('dialog', { name: 'aiChat.title' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'aiChat.placeholder' })).toHaveFocus(),
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

  it('persists model and reasoning choices and sends them with the next request', async () => {
    const user = userEvent.setup();
    render(<AdminAiChat />);
    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));

    const model = await screen.findByRole('combobox', { name: 'aiChat.model' });
    const effort = screen.getByRole('combobox', { name: 'aiChat.reasoningEffort' });
    await user.selectOptions(model, 'gpt-5.6-luna');
    await user.selectOptions(effort, 'medium');

    expect(window.localStorage.getItem(ADMIN_AI_MODEL_STORAGE_KEY)).toBe('gpt-5.6-luna');
    expect(window.localStorage.getItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY)).toBe('medium');
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
    });
  });

  it('renders proposal review controls and applies the selected review action', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
          JSON.stringify({
            message: 'A discount proposal is ready.',
            toolResults: [
              {
                type: 'tool-result',
                output: { id: 84, type: 'product_discount', status: 'proposed' },
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

  it('persists the auto-accept toggle and automatically applies new proposals', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
          JSON.stringify({
            message: 'A category proposal is ready.',
            toolResults: [
              {
                type: 'tool-result',
                output: { id: 91, type: 'entity_create', status: 'proposed' },
              },
            ],
            conversation: {
              id: 12,
              sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
              title: 'Create category',
            },
          }),
          { status: 200 },
        );
      if (url === '/api/ai/proposals/91')
        return new Response(
          JSON.stringify({ proposal: { id: 91, status: 'applied', verified: true } }),
          { status: 200 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    const toggle = await screen.findByRole('switch', { name: 'aiChat.autoAccept' });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY)).toBe('true');

    await user.type(
      screen.getByRole('textbox', { name: 'aiChat.placeholder' }),
      'Create a category',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('aiChat.applied')).toBeInTheDocument();
    const reviewCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === '/api/ai/proposals/91');
    expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({ action: 'approve' });
  });

  it('keeps a failed automatic approval available for manual review', async () => {
    window.localStorage.setItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY, 'true');
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
          JSON.stringify({
            message: 'A proposal is ready.',
            toolResults: [{ type: 'tool-result', output: { id: 92, status: 'proposed' } }],
            conversation: {
              id: 12,
              sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
              title: 'Protected proposal',
            },
          }),
          { status: 200 },
        );
      if (url === '/api/ai/proposals/92')
        return new Response(
          JSON.stringify({
            error: 'The source product changed after this proposal was generated.',
            code: 'proposal_stale',
            nextAction: 'regenerate',
          }),
          { status: 409 },
        );
      return new Response('{}', { status: 200 });
    });
    const user = userEvent.setup();
    render(<AdminAiChat />);

    await user.click(screen.getByRole('button', { name: 'aiChat.open' }));
    expect(await screen.findByRole('switch', { name: 'aiChat.autoAccept' })).toBeChecked();
    await user.type(
      screen.getByRole('textbox', { name: 'aiChat.placeholder' }),
      'Apply a protected proposal',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(
      await screen.findByText('The source product changed after this proposal was generated.'),
    ).toBeInTheDocument();
    expect(screen.getByText('aiChat.proposalNextActions.regenerate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'aiChat.approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'aiChat.reject' })).toBeInTheDocument();
  });

  it('does not show completion when an approval response lacks persistence verification', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
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
                  '{"type":"status","status":"thinking"}\n{"type":"status","status":"working","toolName":"create_landing_page","phase":"running"}\n',
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
          '{"type":"status","status":"working","toolName":"create_landing_page","phase":"completed"}\n',
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

  it('renders canonical Analytics2 metrics, source health, and data notes', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return new Response(
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
                      kind: 'analytics2',
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
    expect(screen.getByText('aiChat.sourceHealth')).toBeInTheDocument();
    expect(screen.getByText(/orders · current · 100%/)).toBeInTheDocument();
    expect(screen.getAllByText(/aiChat.analyticsWarning/).length).toBeGreaterThan(0);
    expect(screen.getByText(/aiChat.analyticsSharedRange/)).toHaveTextContent(
      '2026-06-10–2026-08-19',
    );
    expect(screen.getByText('Canonical filtered product decision view.')).toBeInTheDocument();
    expect(screen.getByText(/aiChat.analyticsMatched/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /aiChat.openAnalytics/ })).toHaveAttribute(
      'href',
      '/en/stats/products?range=custom&startDate=2026-06-10&endDate=2026-08-19&grain=week',
    );
  });

  it('presents persisted tool actions with a human outcome and exact workspace handoff', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      if (url === '/api/ai/chat')
        return Response.json({
          message: 'The landing page was created as a draft.',
          toolResults: [
            {
              type: 'tool-result',
              toolName: 'create_landing_page',
              output: {
                id: 91,
                productId: 12,
                locale: 'fr',
                active: false,
                currentRevision: 1,
                generation: {
                  model: 'openai/gpt-5.6-luna',
                  reasoning: 'A mobile-first product campaign.',
                  stages: {
                    status: 'completed',
                    plannedSections: 4,
                    generatedSections: 4,
                    preservedSections: 0,
                    fallbackSections: 0,
                    skippedSections: 0,
                    retryCount: 1,
                    failures: [],
                  },
                },
              },
            },
          ],
          conversation: {
            id: 31,
            sessionKey: '182ffc13-33e5-43b7-a064-e4c437b0ea67',
            title: 'Create drill landing page',
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
      'Create a landing page for the drill',
    );
    await user.click(screen.getByRole('button', { name: 'aiChat.send' }));

    expect(await screen.findByText('aiChat.toolLabels.landingPageCreated')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'aiChat.toolDestinations.landingPages' }),
    ).toHaveAttribute('href', '/en/assets/landing-pages/91');
    expect(screen.getByText('create landing page')).toBeInTheDocument();
    expect(screen.getByText('aiChat.landingGeneration.status.completed')).toBeInTheDocument();
    expect(screen.getByText('aiChat.landingGeneration.generated')).toBeInTheDocument();
    expect(screen.getByText('aiChat.landingGeneration.retries')).toBeInTheDocument();
    expect(screen.getByText('A mobile-first product campaign.')).toBeInTheDocument();
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

  it('marks partial provider output as interrupted instead of presenting it as complete', async () => {
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
    expect(await screen.findByText('aiChat.interrupted')).toBeInTheDocument();
    expect(await screen.findByText('aiChat.toolLabels.ordersUpdated')).toBeInTheDocument();
    expect(screen.queryByText('aiChat.error')).not.toBeInTheDocument();
  });

  it('renders assistant Markdown using the bulletin post formatting', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/ai/history')) {
        return new Response(JSON.stringify({ proposals: [], jobs: [] }), { status: 200 });
      }
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return new Response(
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
    const bubble = screen
      .getByText('Product searches', { selector: 'strong' })
      .closest('[data-slot="admin-ai-assistant-bubble"]');
    expect(bubble).toHaveClass('min-w-0', 'w-full', 'max-w-[42rem]', 'overflow-hidden');
    expect(bubble?.firstElementChild).toHaveClass(
      'min-w-0',
      'max-w-full',
      'overflow-hidden',
      '[overflow-wrap:anywhere]',
    );
  });

  it('keeps Markdown tables inside the assistant reading width and wraps their cells', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/ai/conversations')
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      return new Response(
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
    expect(table).toHaveClass('w-full', 'max-w-full', 'table-fixed');
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
    expect(screen.getByText('aiChat.toolLabels.inventory')).toBeInTheDocument();
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

describe('selectAnalyticsChartMetric', () => {
  it('prefers a populated metric over an earlier all-zero metric', () => {
    const rows = [
      { name: 'A', purchases: 0, views: 12 },
      { name: 'B', purchases: 0, views: 7 },
    ];

    expect(selectAnalyticsChartMetric(rows, ['name', 'purchases', 'views'])).toBe('views');
  });

  it('uses semantic priority instead of comparing magnitudes across different units', () => {
    const rows = [{ name: 'A', purchases: 2, views: 500_000 }];

    expect(selectAnalyticsChartMetric(rows, ['name', 'purchases', 'views'])).toBe('purchases');
  });

  it('does not render a misleading empty bar chart when every metric is zero', () => {
    expect(selectAnalyticsChartMetric([{ title: 'A', orders: 0 }], ['title', 'orders'])).toBeNull();
  });

  it('omits unavailable chart points instead of converting them to zero', () => {
    expect(
      analyticsChartRows(
        [
          { title: 'Missing', orders: null },
          { title: 'Observed zero', orders: 0 },
          { title: 'Observed', orders: 4 },
        ],
        'orders',
      ),
    ).toEqual([
      { title: 'Observed zero', orders: 0, __chartValue: 0 },
      { title: 'Observed', orders: 4, __chartValue: 4 },
    ]);
  });
});
