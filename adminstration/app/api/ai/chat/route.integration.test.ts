import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  insertedValues: [] as unknown[],
  updatedValues: [] as unknown[],
  returningCount: 0,
  failTelemetry: false,
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@bric/ai-core')>(),
  createAiLanguageModel: () => 'openrouter-model',
  getAiConfig: () => ({ enabled: true, provider: 'openrouter' }),
  resolveAiModel: () => 'deepseek/deepseek-v4-flash',
}));

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  stepCountIs: () => 'stop-condition',
  tool: (definition: unknown) => definition,
}));

vi.mock('../../../../db/client', () => ({
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
            if (mocks.failTelemetry && values && typeof values === 'object' && 'task' in values) throw new Error('Telemetry unavailable');
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
  auth: async () => ({ user: { email: 'admin@bricomaitre.com', name: 'Admin', permissions: [] } }),
}));

vi.mock('../../../../lib/rbac', () => ({ requireAiUseAccess: async () => null }));

import { POST } from './route';

function request() {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Summarize catalog gaps',
      conversationKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
    }),
  });
}

async function events(response: Response) {
  return (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

function streamedResult({ text, withTool = false, usage = { inputTokens: 120, outputTokens: 30, totalTokens: 150 } }: { text: string; withTool?: boolean; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }) {
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
  });

  it('records a DeepSeek chat run, token usage, conversation, and tool calls', async () => {
    mocks.streamText.mockReturnValue(streamedResult({ text: 'Done', withTool: true }));

    const response = await POST(request());
    const frames = await events(response);

    expect(response.status).toBe(200);
    expect(frames[0]).toEqual({ type: 'status', status: 'thinking' });
    expect(frames).toContainEqual({ type: 'text-delta', delta: 'Done' });
    expect(frames.at(-1)).toMatchObject({ type: 'result', conversation: { id: 101 }, toolResults: [expect.objectContaining({ toolName: 'find_products' })] });
    expect(mocks.insertedValues[0]).toEqual(expect.objectContaining({
      surface: 'admin',
      actorId: 'admin@bricomaitre.com',
      sessionKey: 'e7249553-56ac-49f5-9e9c-dd8d724a6fac',
    }));
    expect(mocks.insertedValues).toContainEqual(expect.objectContaining({
      conversationId: 101,
      surface: 'admin',
      task: 'admin_chat',
      status: 'running',
      model: 'deepseek/deepseek-v4-flash',
      promptVersion: 'admin-chat-v1',
    }));
    expect(mocks.updatedValues).toContainEqual(expect.objectContaining({
      status: 'completed',
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    }));
    expect(mocks.insertedValues).toContainEqual([expect.objectContaining({
      runId: 202,
      toolName: 'find_products',
      status: 'completed',
    })]);
    expect(mocks.insertedValues).toContainEqual(expect.objectContaining({ conversationId: 101, role: 'user', content: { text: 'Summarize catalog gaps' } }));
    expect(mocks.insertedValues).toContainEqual(expect.objectContaining({ conversationId: 101, role: 'assistant', content: { text: 'Done' } }));
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'Summarize catalog gaps' }],
    }));
  });

  it('marks a started run as failed when generation fails', async () => {
    mocks.streamText.mockReturnValue({ stream: (async function* () { throw new Error('OpenRouter request failed'); })() });

    const response = await POST(request());
    const frames = await events(response);

    expect(response.status).toBe(200);
    expect(frames.at(-1)).toEqual({ type: 'error', code: 'admin_ai_failed' });
    expect(mocks.updatedValues).toContainEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'Error',
    }));
  });

  it('still returns the assistant response when telemetry storage fails', async () => {
    mocks.failTelemetry = true;
    mocks.streamText.mockReturnValue(streamedResult({ text: 'Done without telemetry', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    const frames = await events(response);
    expect(frames.filter((frame) => frame.type === 'text-delta').map((frame) => frame.delta).join('')).toBe('Done without telemetry');
    expect(frames.at(-1)).toMatchObject({ type: 'result', conversation: { id: 101, title: 'Summarize catalog gaps' } });
  });
});
