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
});
