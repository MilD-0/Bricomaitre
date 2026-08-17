import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  insertedValues: [] as unknown[],
  updatedValues: [] as unknown[],
  returningCount: 0,
  failTelemetry: false,
  permissions: [] as string[],
  streamOptions: null as null | {
    tools?: Record<string, { execute?: (input: unknown) => unknown }>;
  },
  startCategorization: vi.fn(),
  startContent: vi.fn(),
  proposeContent: vi.fn(),
  getCategorizationStatus: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  startJob: vi.fn(),
  cancelJob: vi.fn(),
  createLanguageModel: vi.fn(),
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createAiLanguageModel: mocks.createLanguageModel,
  getAiConfig: () => ({ enabled: true, provider: 'openrouter' }),
  resolveAiModel: () => 'deepseek/deepseek-v4-flash',
}));

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  stepCountIs: () => 'stop-condition',
  tool: (definition: unknown) => definition,
}));

vi.mock('@bric/db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertedValues.push(values);
        return {
          returning: async () => {
            if (mocks.failTelemetry && values && typeof values === 'object' && 'task' in values)
              throw new Error('Telemetry unavailable');
            mocks.returningCount += 1;
            return [{ id: mocks.returningCount === 1 ? 101 : 202 }];
          },
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updatedValues.push(values);
        return { where: async () => undefined };
      },
    }),
  }),
}));

vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({
    user: { email: 'admin@bricomaitre.com', name: 'Admin', permissions: mocks.permissions },
  }),
}));

vi.mock('../../../../lib/rbac', () => ({ requireAiUseAccess: async () => null }));
vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_AI_CATEGORIZATION_QUEUE: 'admin-ai-categorization',
  ADMIN_AI_CONTENT_QUEUE: 'admin-ai-content',
  getLatestExportJob: mocks.getCategorizationStatus,
  startAiContentJob: mocks.startContent,
  startAiCategorizationJob: mocks.startCategorization,
}));
vi.mock('../../../../lib/ai-product-content', () => ({
  proposeProductContent: mocks.proposeContent,
}));
vi.mock('../../../../lib/ai-background-jobs', () => ({
  ADMIN_BACKGROUND_JOB_TYPES: [
    'ai_categorization',
    'ai_content',
    'product_export',
    'catalog_feed_refresh',
    'order_export',
    'order_ecotrack',
    'stats_import',
    'ad_cost_import',
    'reporting_refresh',
    'ecotrack_catalog_sync',
    'ecotrack_shipment_sync',
  ],
  STARTABLE_ADMIN_BACKGROUND_JOB_TYPES: [
    'product_export',
    'catalog_feed_refresh',
    'order_export',
    'reporting_refresh',
    'ecotrack_catalog_sync',
    'ecotrack_shipment_sync',
  ],
  listAdminBackgroundJobs: mocks.listJobs,
  getAdminBackgroundJob: mocks.getJob,
  startAdminBackgroundJob: mocks.startJob,
  cancelAdminBackgroundJob: mocks.cancelJob,
}));

import { POST } from './route';

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Summarize catalog gaps',
      conversationKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
      ...overrides,
    }),
  });
}

async function events(response: Response) {
  return (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function streamedResult({
  text,
  withTool = false,
  usage = { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
}: {
  text: string;
  withTool?: boolean;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}) {
  return {
    stream: (async function* () {
      if (withTool) {
        yield { type: 'tool-call', toolName: 'find_products' };
        yield { type: 'tool-result', toolName: 'find_products', output: [] };
      }
      yield { type: 'text-delta', text };
      yield { type: 'finish', totalUsage: usage };
    })(),
  };
}

describe('POST /api/ai/chat telemetry', () => {
  beforeEach(() => {
    mocks.streamText.mockReset();
    mocks.insertedValues.length = 0;
    mocks.updatedValues.length = 0;
    mocks.returningCount = 0;
    mocks.failTelemetry = false;
    mocks.permissions = [];
    mocks.streamOptions = null;
    mocks.startCategorization
      .mockReset()
      .mockResolvedValue({ kind: 'started', job: { id: 'job-1' } });
    mocks.startContent
      .mockReset()
      .mockResolvedValue({ kind: 'started', job: { id: 'content-job-1' } });
    mocks.proposeContent
      .mockReset()
      .mockImplementation(async ({ productId }: { productId: number }) => ({
        id: productId,
        status: 'proposed',
      }));
    mocks.getCategorizationStatus.mockReset().mockResolvedValue({
      id: 'job-1',
      queue: 'admin-ai-categorization',
      kind: 'ai-product-categorization',
      status: 'running',
      progress: { phase: 'classifying-products', current: 12, total: 100, percentage: 12 },
      errorMessage: null,
      resultSummary: null,
    });
    mocks.listJobs.mockReset().mockResolvedValue([]);
    mocks.getJob.mockReset().mockResolvedValue({ id: 'job-1', status: 'running' });
    mocks.startJob
      .mockReset()
      .mockResolvedValue({ kind: 'started', job: { id: 'job-2', status: 'queued' } });
    mocks.cancelJob
      .mockReset()
      .mockResolvedValue({ job: { id: 'job-1', status: 'running', cancelRequested: true } });
    mocks.createLanguageModel.mockReset().mockReturnValue('openrouter-model');
  });

  it('records a DeepSeek chat run, token usage, conversation, and tool calls', async () => {
    mocks.streamText.mockReturnValue(streamedResult({ text: 'Done', withTool: true }));

    const response = await POST(request());
    const frames = await events(response);

    expect(response.status).toBe(200);
    expect(frames[0]).toEqual({ type: 'status', status: 'thinking' });
    expect(frames).toContainEqual({ type: 'text-delta', delta: 'Done' });
    expect(frames.at(-1)).toMatchObject({
      type: 'result',
      conversation: { id: 101 },
      toolResults: [expect.objectContaining({ toolName: 'find_products' })],
    });
    expect(mocks.insertedValues[0]).toEqual(
      expect.objectContaining({
        surface: 'admin',
        actorId: 'admin@bricomaitre.com',
        sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
      }),
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        conversationId: 101,
        surface: 'admin',
        task: 'admin_chat',
        status: 'running',
        model: 'deepseek/deepseek-v4-flash',
        promptVersion: 'admin-chat-v2',
      }),
    );
    expect(mocks.updatedValues).toContainEqual(
      expect.objectContaining({
        status: 'completed',
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
      }),
    );
    expect(mocks.insertedValues).toContainEqual([
      expect.objectContaining({
        runId: 202,
        toolName: 'find_products',
        status: 'completed',
      }),
    ]);
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        conversationId: 101,
        role: 'user',
        content: { text: 'Summarize catalog gaps' },
      }),
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        conversationId: 101,
        role: 'assistant',
        content: { text: 'Done' },
      }),
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Summarize catalog gaps' }],
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('pins the fast DeepSeek choice to the Baidu FP8 endpoint and records that route', async () => {
    mocks.streamText.mockReturnValue(streamedResult({ text: 'Fast response' }));

    const response = await POST(
      request({
        model: 'deepseek-v4-flash-fast',
        reasoningEffort: 'xhigh',
      }),
    );
    await events(response);

    expect(response.status).toBe(200);
    expect(mocks.createLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openrouter' }),
      'admin',
      {
        model: 'deepseek/deepseek-v4-flash',
        openRouterRequestBody: {
          reasoning: { effort: 'xhigh' },
          provider: {
            order: ['baidu/fp8'],
            only: ['baidu/fp8'],
            allow_fallbacks: false,
            require_parameters: true,
            quantizations: ['fp8'],
          },
        },
      },
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        task: 'admin_chat',
        model: 'deepseek/deepseek-v4-flash@baidu/fp8',
      }),
    );
  });

  it('rejects reasoning efforts that the selected model does not support', async () => {
    const response = await POST(
      request({
        model: 'deepseek-v4-flash',
        reasoningEffort: 'low',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('marks a started run as failed when generation fails', async () => {
    mocks.streamText.mockReturnValue({
      stream: (async function* () {
        throw new Error('OpenRouter request failed');
      })(),
    });

    const response = await POST(request());
    const frames = await events(response);

    expect(response.status).toBe(200);
    expect(frames.at(-1)).toEqual({ type: 'error', code: 'admin_ai_failed' });
    expect(mocks.updatedValues).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'Error',
      }),
    );
  });

  it('still returns the assistant response when telemetry storage fails', async () => {
    mocks.failTelemetry = true;
    mocks.streamText.mockReturnValue(
      streamedResult({
        text: 'Done without telemetry',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    const frames = await events(response);
    expect(
      frames
        .filter((frame) => frame.type === 'text-delta')
        .map((frame) => frame.delta)
        .join(''),
    ).toBe('Done without telemetry');
    expect(frames.at(-1)).toMatchObject({
      type: 'result',
      conversation: { id: 101, title: 'Summarize catalog gaps' },
    });
  });

  it('exposes taxonomy lookup and reviewable mutation tools to catalog proposers', async () => {
    mocks.permissions = ['ai_catalog_propose'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Ready' });
    });

    const response = await POST(request());
    await events(response);

    expect(Object.keys(mocks.streamOptions?.tools ?? {})).toEqual(
      expect.arrayContaining([
        'find_products',
        'find_brands',
        'find_categories',
        'categorize_catalog',
        'get_catalog_categorization_status',
        'get_product_content_job_status',
        'propose_product_edit',
        'propose_brand_edit',
        'propose_category_edit',
        'propose_brand_create',
        'propose_category_create',
      ]),
    );
    expect(mocks.streamOptions?.tools).not.toHaveProperty('propose_entity_edit');

    await mocks.streamOptions?.tools?.categorize_catalog?.execute?.({
      scope: 'all_active',
      confidenceThreshold: 0.75,
      batchSize: 25,
    });
    expect(mocks.startCategorization).toHaveBeenCalledWith('admin@bricomaitre.com', {
      scope: 'all_active',
      confidenceThreshold: 0.75,
      batchSize: 25,
      autoApply: false,
      conversationId: 101,
      actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
    });

    await mocks.streamOptions?.tools?.get_catalog_categorization_status?.execute?.({});
    expect(mocks.getCategorizationStatus).toHaveBeenCalledWith(
      'admin-ai-categorization',
      'admin@bricomaitre.com',
    );
  });

  it('passes batch auto-apply only when the requester has both apply and product-write permissions', async () => {
    mocks.permissions = ['ai_catalog_propose', 'ai_catalog_apply', 'products_write'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Queued' });
    });
    const autoRequest = new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Categorize the whole catalog',
        conversationKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
        autoAcceptProposals: true,
      }),
    });

    await events(await POST(autoRequest));
    await mocks.streamOptions?.tools?.categorize_catalog?.execute?.({
      scope: 'all_active',
      confidenceThreshold: 0.75,
      batchSize: 25,
    });

    expect(mocks.startCategorization).toHaveBeenCalledWith(
      'admin@bricomaitre.com',
      expect.objectContaining({
        autoApply: true,
      }),
    );
  });

  it('runs at most 20 explicit content proposals inline and queues larger scopes', async () => {
    mocks.permissions = ['ai_catalog_propose'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Ready' });
    });

    await events(await POST(request()));
    const execute = mocks.streamOptions?.tools?.generate_product_content?.execute;
    await execute?.({
      scope: 'explicit',
      productIds: Array.from({ length: 20 }, (_, index) => index + 1),
      fields: ['titleAr'],
    });
    expect(mocks.proposeContent).toHaveBeenCalledTimes(20);
    expect(mocks.startContent).not.toHaveBeenCalled();

    await execute?.({
      scope: 'explicit',
      productIds: Array.from({ length: 21 }, (_, index) => index + 1),
      fields: ['titleAr'],
    });
    expect(mocks.startContent).toHaveBeenCalledWith(
      'admin@bricomaitre.com',
      expect.objectContaining({
        productIds: Array.from({ length: 21 }, (_, index) => index + 1),
        fields: ['titleAr'],
        onlyMissing: false,
        autoApply: false,
      }),
    );
  });

  it('queues catalog-wide missing Arabic titles with authorized verified auto-apply enabled', async () => {
    mocks.permissions = ['ai_catalog_propose', 'ai_catalog_apply', 'products_write'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Queued' });
    });
    const autoRequest = new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Add Arabic titles to all products missing one',
        conversationKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
        autoAcceptProposals: true,
      }),
    });

    await events(await POST(autoRequest));
    await mocks.streamOptions?.tools?.generate_product_content?.execute?.({
      scope: 'all_missing',
      productIds: [],
      fields: ['titleAr'],
    });

    expect(mocks.startContent).toHaveBeenCalledWith('admin@bricomaitre.com', {
      productIds: null,
      fields: ['titleAr'],
      onlyMissing: true,
      autoApply: true,
      conversationId: 101,
      context: undefined,
      actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
    });

    await mocks.streamOptions?.tools?.get_product_content_job_status?.execute?.({});
    expect(mocks.getCategorizationStatus).toHaveBeenCalledWith(
      'admin-ai-content',
      'admin@bricomaitre.com',
    );
  });

  it('exposes database-wide job inspection and explicit controls only to settings managers', async () => {
    mocks.permissions = ['settings_manage'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Jobs ready' });
    });

    await events(await POST(request()));

    expect(Object.keys(mocks.streamOptions?.tools ?? {})).toEqual(
      expect.arrayContaining([
        'list_background_jobs',
        'get_background_job',
        'start_background_job',
        'stop_background_job',
      ]),
    );

    const jobId = '3c2e0103-ce88-4b4b-b185-f46ed298fe27';
    await mocks.streamOptions?.tools?.list_background_jobs?.execute?.({ limit: 20 });
    await mocks.streamOptions?.tools?.get_background_job?.execute?.({
      type: 'ai_categorization',
      jobId,
    });
    await mocks.streamOptions?.tools?.start_background_job?.execute?.({
      type: 'order_export',
      orderMode: 'selected',
      orderIds: [10, 20],
    });
    await mocks.streamOptions?.tools?.stop_background_job?.execute?.({
      type: 'ai_categorization',
      jobId,
    });

    expect(mocks.listJobs).toHaveBeenCalledWith(20);
    expect(mocks.getJob).toHaveBeenCalledWith('ai_categorization', jobId);
    expect(mocks.startJob).toHaveBeenCalledWith({
      type: 'order_export',
      orderMode: 'selected',
      orderIds: [10, 20],
      conversationId: 101,
      actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
    });
    expect(mocks.cancelJob).toHaveBeenCalledWith('ai_categorization', jobId);
  });

  it('does not expose database-wide job controls without settings management access', async () => {
    mocks.permissions = ['ai_catalog_propose'];
    mocks.streamText.mockImplementation((options) => {
      mocks.streamOptions = options as typeof mocks.streamOptions;
      return streamedResult({ text: 'Catalog only' });
    });

    await events(await POST(request()));

    expect(mocks.streamOptions?.tools).not.toHaveProperty('list_background_jobs');
    expect(mocks.streamOptions?.tools).not.toHaveProperty('start_background_job');
    expect(mocks.streamOptions?.tools).not.toHaveProperty('stop_background_job');
  });
});
