import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

import {
  assertAiConfigured,
  createAiLanguageModel,
  getAiConfig,
  mergeAiChatRequestBody,
  resolveAiModel,
} from './config';

describe('AI configuration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('selects ExperientialLabs credentials and normalizes existing namespaced model settings', () => {
    const config = getAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'experientiallabs',
      EXPLABS_API_KEY: 'xpl_test',
      OPENROUTER_API_KEY: 'unused',
      AI_CONTENT_MODEL: 'openai/gpt-5.6-luna',
    });
    expect(config.apiKey).toBe('xpl_test');
    expect(createAiLanguageModel(config, 'content')).toMatchObject({
      provider: 'experientiallabs.chat',
      modelId: 'gpt-5.6-luna',
    });
    expect(() =>
      assertAiConfigured(
        getAiConfig({
          AI_ENABLED: 'true',
          AI_PROVIDER: 'experientiallabs',
          OPENROUTER_API_KEY: 'wrong-key',
        }),
      ),
    ).toThrow('EXPLABS_API_KEY is not configured');
    expect(() =>
      getAiConfig({ AI_PROVIDER: 'experientiallabs', EXPLABS_BASE_URL: 'invalid' }),
    ).toThrow();
  });

  it('runs a complete ExperientialLabs tool round trip with the correct wire parameters', async () => {
    const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        requests.push({
          url: String(url),
          headers: new Headers(init.headers),
          body: JSON.parse(init.body),
        });
        const first = requests.length === 1;
        return Response.json({
          id: 'chat-test',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-5.6-luna',
          choices: [
            {
              index: 0,
              finish_reason: first ? 'tool_calls' : 'stop',
              message: first
                ? {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call-1',
                        type: 'function',
                        function: { name: 'lookup', arguments: '{"orderId":91}' },
                      },
                    ],
                  }
                : { role: 'assistant', content: 'Order 91 exists.' },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
        });
      }),
    );
    const model = createAiLanguageModel(
      getAiConfig({
        AI_ENABLED: 'true',
        AI_PROVIDER: 'experientiallabs',
        EXPLABS_API_KEY: 'xpl_test',
        OPENROUTER_BASE_URL: 'https://unused.example/v1',
        OPENROUTER_HTTP_REFERER: 'https://unused.example',
      }),
      'admin',
      { model: 'openai/gpt-5.6-luna', chatRequestBody: { reasoning_effort: 'medium' } },
    );
    const lookup = vi.fn(async ({ orderId }: { orderId: number }) => ({ orderId, exists: true }));
    const result = await generateText({
      model,
      prompt: 'Check order 91.',
      maxRetries: 0,
      tools: { lookup: tool({ inputSchema: z.object({ orderId: z.number() }), execute: lookup }) },
      stopWhen: stepCountIs(2),
    });
    expect(result.text).toBe('Order 91 exists.');
    expect(lookup).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe('https://api.experientiallabs.ai/v1/chat/completions');
      expect(request.headers.get('authorization')).toBe('Bearer xpl_test');
      expect(request.headers.has('HTTP-Referer')).toBe(false);
      expect(request.body).toMatchObject({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' });
      expect(request.body).not.toHaveProperty('provider');
      expect(request.body).not.toHaveProperty('reasoning');
    }
    expect(requests[1]!.body.messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-1',
        content: JSON.stringify({ orderId: 91, exists: true }),
      }),
    );
  });

  it('streams ExperientialLabs responses and exposes authentication failures', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        [
          {
            id: 'chat-test',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'deepseek-v4-flash',
            choices: [{ index: 0, delta: { content: 'Ready.' }, finish_reason: null }],
          },
          {
            id: 'chat-test',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'deepseek-v4-flash',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          },
        ]
          .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
          .join('') + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const model = createAiLanguageModel(
      getAiConfig({
        AI_ENABLED: 'true',
        AI_PROVIDER: 'experientiallabs',
        EXPLABS_API_KEY: 'xpl_test',
        EXPLABS_BASE_URL: 'https://gateway.example/v1',
        AI_ADMIN_MODEL: 'deepseek-v4-flash',
      }),
      'admin',
    );
    const result = streamText({ model, prompt: 'Hello', maxRetries: 0 });
    let text = '';
    for await (const part of result.stream) if (part.type === 'text-delta') text += part.text;
    expect(text).toBe('Ready.');
    expect(fetch.mock.calls[0]![0]).toBe('https://gateway.example/v1/chat/completions');
    fetch.mockResolvedValueOnce(
      Response.json(
        { error: { message: 'Invalid key', type: 'authentication_error', code: 'invalid_key' } },
        { status: 401 },
      ),
    );
    await expect(generateText({ model, prompt: 'Hello', maxRetries: 0 })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('is disabled and credential-free by default', () => {
    expect(getAiConfig({})).toEqual({
      enabled: false,
      provider: 'openai',
      apiKey: undefined,
      adminModel: undefined,
      storefrontModel: undefined,
      contentModel: undefined,
      experientialLabsBaseUrl: undefined,
      openRouterBaseUrl: undefined,
      openRouterReferer: undefined,
      openRouterTitle: undefined,
      requestTimeoutMs: 30_000,
      maxRetries: 5,
    });
  });

  it('parses OpenRouter credentials and attribution independently from OpenAI', () => {
    const config = getAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openrouter',
      OPENAI_API_KEY: 'unused-openai-secret',
      OPENROUTER_API_KEY: 'openrouter-secret',
      OPENROUTER_BASE_URL: 'https://openrouter.example/api/v1',
      OPENROUTER_HTTP_REFERER: 'https://bricomaitre.com',
      OPENROUTER_APP_TITLE: 'Bricomaitre',
      AI_STOREFRONT_MODEL: 'anthropic/claude-sonnet-4',
    });

    expect(config).toMatchObject({
      provider: 'openrouter',
      apiKey: 'openrouter-secret',
      openRouterBaseUrl: 'https://openrouter.example/api/v1',
      openRouterReferer: 'https://bricomaitre.com',
      openRouterTitle: 'Bricomaitre',
    });
    expect(resolveAiModel(config, 'storefront')).toBe('anthropic/claude-sonnet-4');
    expect(createAiLanguageModel(config, 'storefront')).toMatchObject({
      modelId: 'anthropic/claude-sonnet-4',
      provider: 'openrouter.chat',
    });
  });

  it('parses an enabled task configuration', () => {
    const config = getAiConfig({
      AI_ENABLED: 'true',
      OPENAI_API_KEY: 'secret',
      AI_ADMIN_MODEL: 'admin-model',
      AI_REQUEST_TIMEOUT_MS: '45000',
      AI_MAX_RETRIES: '3',
    });

    expect(() => assertAiConfigured(config)).not.toThrow();
    expect(resolveAiModel(config, 'admin')).toBe('admin-model');
    expect(config.requestTimeoutMs).toBe(45_000);
  });

  it('fails closed when AI or the requested model is not configured', () => {
    expect(() => assertAiConfigured(getAiConfig({}))).toThrow('AI is disabled');
    expect(() =>
      resolveAiModel(getAiConfig({ AI_ENABLED: 'true', OPENAI_API_KEY: 'secret' }), 'admin'),
    ).toThrow('AI_ADMIN_MODEL is not configured');
    expect(() =>
      assertAiConfigured(
        getAiConfig({
          AI_ENABLED: 'true',
          AI_PROVIDER: 'openrouter',
          OPENAI_API_KEY: 'wrong-provider-key',
        }),
      ),
    ).toThrow('OPENROUTER_API_KEY is not configured');
  });

  it('rejects unsupported providers and invalid OpenRouter URLs', () => {
    expect(() => getAiConfig({ AI_PROVIDER: 'other' })).toThrow();
    expect(() =>
      getAiConfig({ AI_PROVIDER: 'openrouter', OPENROUTER_HTTP_REFERER: 'not-a-url' }),
    ).toThrow();
  });

  it('adds OpenRouter-specific reasoning and routing fields without replacing the generated request', () => {
    expect(
      JSON.parse(
        mergeAiChatRequestBody(
          JSON.stringify({ model: 'deepseek/deepseek-v4-flash', messages: [], stream: true }),
          {
            reasoning: { effort: 'xhigh' },
            provider: { only: ['baidu/fp8'], allow_fallbacks: false },
          },
        ),
      ),
    ).toEqual({
      model: 'deepseek/deepseek-v4-flash',
      messages: [],
      stream: true,
      reasoning: { effort: 'xhigh' },
      provider: { only: ['baidu/fp8'], allow_fallbacks: false },
    });
  });
});
