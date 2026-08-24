import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiStatsPayload } from '../../lib/ai-stats';
import { AiStatsWorkspace } from './ai-stats-workspace';

const { replaceMock, requestMock, searchParamsState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  requestMock: vi.fn(),
  searchParamsState: { current: 'range=30d&grain=auto' },
}));

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/stats/ai-assistants',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsState.current),
}));
vi.mock('../../lib/admin-api', () => ({ requestJson: requestMock }));

function filters(surface: 'operations' | 'shopping') {
  return {
    surface,
    range: '30d' as const,
    startDate: '2026-07-15',
    endDate: '2026-08-13',
    grain: 'auto' as const,
    resolvedGrain: 'day' as const,
  };
}

function operationsPayload(): AiStatsPayload {
  return {
    surface: 'operations',
    filters: filters('operations'),
    generatedAt: '2026-08-13T12:00:00.000Z',
    referenceDate: '2026-08-13',
    reviewClock: true,
    coverage: { fromDate: '2026-07-21', throughDate: '2026-08-13', records: 97 },
    data: {
      kind: 'operations',
      metrics: [
        { key: 'interactiveRequests', value: 97, unit: 'number' },
        { key: 'responseCompletion', value: 95.65, unit: 'percent', sample: 92 },
        { key: 'toolCompletion', value: 100, unit: 'percent', sample: 247 },
        { key: 'p95Latency', value: 82_986, unit: 'milliseconds', sample: 97 },
        { key: 'helpfulRatings', value: null, unit: 'percent', sample: 0 },
        { key: 'costPerCompletion', value: 0.0032, unit: 'usd', sample: 88 },
      ],
      summary: {
        interactiveRuns: 97,
        completed: 88,
        failed: 4,
        cancelled: 5,
        running: 0,
        activeOperators: 2,
        validDurationSamples: 97,
        totalTokens: 1_244_929,
        estimatedCostUsd: 0.28,
        costCoveragePct: 100,
        assistantAnswers: 89,
        ratedAnswers: 0,
        helpfulAnswers: 0,
        toolCalls: 247,
        completedToolCalls: 247,
      },
      trend: [
        { bucket: '2026-08-12', runs: 8, completed: 7, failed: 1, cancelled: 0, tokens: 42_000 },
        { bucket: '2026-08-13', runs: 5, completed: 4, failed: 0, cancelled: 1, tokens: 25_000 },
      ],
      workflows: [
        {
          task: 'admin_chat',
          mode: 'interactive',
          runs: 97,
          completed: 88,
          failed: 4,
          cancelled: 5,
          completionPct: 95.65,
          p95DurationMs: 82_986,
          tokens: 1_244_929,
          estimatedCostUsd: 0.28,
        },
        {
          task: 'product_categorization',
          mode: 'batch',
          runs: 1_502,
          completed: 1_502,
          failed: 0,
          cancelled: 0,
          completionPct: 100,
          p95DurationMs: null,
          tokens: 6_962_914,
          estimatedCostUsd: 0.71,
        },
      ],
      tools: [
        {
          name: 'find_products',
          calls: 80,
          completed: 80,
          failed: 0,
          completionPct: 100,
          p95DurationMs: 90,
        },
      ],
      releases: [
        {
          promptVersion: 'admin-chat-v36',
          model: 'openai/gpt-5.6-luna',
          runs: 16,
          completed: 15,
          failed: 1,
          cancelled: 0,
          completionPct: 93.75,
          p95DurationMs: 43_000,
          tokens: 172_000,
          estimatedCostUsd: 0.18,
        },
      ],
      changes: [{ type: 'entity_edit', status: 'applied', count: 75 }],
      exceptions: [],
    },
    diagnostics: { queryDurationMs: 56, responseSizeBytes: 6_979 },
  };
}

function shoppingPayload(): AiStatsPayload {
  return {
    surface: 'shopping',
    filters: filters('shopping'),
    generatedAt: '2026-08-17T12:00:00.000Z',
    referenceDate: '2026-08-17',
    reviewClock: true,
    coverage: { fromDate: '2026-08-16', throughDate: '2026-08-17', records: 107 },
    data: {
      kind: 'shopping',
      enabled: true,
      metrics: [
        { key: 'engagedJourneys', value: 11, unit: 'number' },
        { key: 'resultClickRate', value: 18.2, unit: 'percent', sample: 11 },
        { key: 'recommendedOrders', value: 1, unit: 'number' },
        { key: 'confirmedAssisted', value: 1, unit: 'number' },
        { key: 'paidAssisted', value: 1, unit: 'number' },
        { key: 'paidContribution', value: 3_700, unit: 'dzd', sample: 1 },
      ],
      summary: {
        opens: 80,
        messages: 11,
        resultClicks: 2,
        runs: 12,
        completed: 10,
        failed: 2,
        cancelled: 0,
        activeJourneys: 72,
        ratedAnswers: 0,
        helpfulAnswers: 0,
        p95DurationMs: 9_200,
        durationSamples: 12,
        estimatedCostUsd: 0.0016,
      },
      journey: [
        { key: 'opened', value: 80 },
        { key: 'messaged', value: 11 },
        { key: 'resultClicked', value: 2 },
        { key: 'engagedOrder', value: 1 },
        { key: 'recommendedOrder', value: 1 },
        { key: 'confirmed', value: 1 },
        { key: 'paid', value: 1 },
      ],
      orders: {
        exposed: 8,
        engaged: 1,
        recommendationClicked: 1,
        recommendedProductOrdered: 1,
        confirmedAssisted: 1,
        paidAssisted: 1,
        paidContributionDzd: 3_700,
        contributionCoveragePct: 100,
      },
      trend: [
        { bucket: '2026-08-16', opens: 50, messages: 8, resultClicks: 1, runs: 8, failed: 1 },
        { bucket: '2026-08-17', opens: 30, messages: 3, resultClicks: 1, runs: 4, failed: 1 },
      ],
      intents: [
        {
          name: 'availability',
          messages: 7,
          runs: 7,
          completed: 6,
          resultClicks: 2,
          completionPct: 85.71,
        },
      ],
    },
    diagnostics: { queryDurationMs: 41, responseSizeBytes: 2_100 },
  };
}

function renderWorkspace(payload: AiStatsPayload) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiStatsWorkspace initialData={payload} />
    </QueryClientProvider>,
  );
}

describe('AiStatsWorkspace', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    searchParamsState.current = 'range=30d&grain=auto';
    vi.clearAllMocks();
  });

  it('keeps the clean default route without starting a duplicate server render', () => {
    searchParamsState.current = '';
    renderWorkspace(operationsPayload());

    expect(requestMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('separates interactive assistant work from batch work and leaves unrated quality unavailable', () => {
    renderWorkspace(operationsPayload());

    expect(screen.getByText('AI operations')).toBeInTheDocument();
    expect(screen.getByText('Interactive requests')).toBeInTheDocument();
    expect(screen.getByText('Product Categorization')).toBeInTheDocument();
    expect(screen.getByText('Batch')).toBeInTheDocument();
    expect(screen.getByText('Helpful ratings')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText(/AI-influenced/i)).not.toBeInTheDocument();
  });

  it('uses an exposure-to-paid journey without treating an open as an assisted outcome', () => {
    renderWorkspace(shoppingPayload());

    expect(screen.getByText('Shopping assistant')).toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('Question sent')).toBeInTheDocument();
    expect(screen.getByText('Recommended product ordered')).toBeInTheDocument();
    expect(screen.getByText('Paid assisted orders')).toBeInTheDocument();
    expect(screen.queryByText(/influenced/i)).not.toBeInTheDocument();
    expect(screen.getByText('No ratings')).toBeInTheDocument();
  });

  it('does not fetch a custom date range until Apply is used', async () => {
    const nextPayload = operationsPayload();
    requestMock.mockResolvedValue({ data: nextPayload });
    renderWorkspace(operationsPayload());

    fireEvent.change(screen.getByLabelText('AI analytics range'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-10' } });
    expect(requestMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    const requestedUrl = String(requestMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('surface=operations');
    expect(requestedUrl).toContain('range=custom');
    expect(requestedUrl).toContain('startDate=2026-08-01');
    expect(requestedUrl).toContain('endDate=2026-08-10');
  });
});
