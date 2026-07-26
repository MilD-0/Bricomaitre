import { describe, expect, it } from 'vitest';

import { assertAiConfigured, createAiLanguageModel, getAiConfig, mergeOpenRouterRequestBody, resolveAiModel } from './config';

describe('AI configuration', () => {
  it('is disabled and credential-free by default', () => {
    expect(getAiConfig({})).toEqual({
      enabled: false,
      provider: 'openai',
      apiKey: undefined,
      adminModel: undefined,
      storefrontModel: undefined,
      contentModel: undefined,
      openRouterBaseUrl: undefined,
      openRouterReferer: undefined,
      openRouterTitle: undefined,
      requestTimeoutMs: 30_000,
      maxRetries: 2,
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
    expect(() => resolveAiModel(getAiConfig({ AI_ENABLED: 'true', OPENAI_API_KEY: 'secret' }), 'admin'))
      .toThrow('AI_ADMIN_MODEL is not configured');
    expect(() => assertAiConfigured(getAiConfig({ AI_ENABLED: 'true', AI_PROVIDER: 'openrouter', OPENAI_API_KEY: 'wrong-provider-key' })))
      .toThrow('OPENROUTER_API_KEY is not configured');
  });

  it('rejects unsupported providers and invalid OpenRouter URLs', () => {
    expect(() => getAiConfig({ AI_PROVIDER: 'other' })).toThrow();
    expect(() => getAiConfig({ AI_PROVIDER: 'openrouter', OPENROUTER_HTTP_REFERER: 'not-a-url' })).toThrow();
  });

  it('adds OpenRouter-specific reasoning and routing fields without replacing the generated request', () => {
    expect(JSON.parse(mergeOpenRouterRequestBody(
      JSON.stringify({ model: 'deepseek/deepseek-v4-flash', messages: [], stream: true }),
      {
        reasoning: { effort: 'xhigh' },
        provider: { only: ['baidu/fp8'], allow_fallbacks: false },
      },
    ))).toEqual({
      model: 'deepseek/deepseek-v4-flash',
      messages: [],
      stream: true,
      reasoning: { effort: 'xhigh' },
      provider: { only: ['baidu/fp8'], allow_fallbacks: false },
    });
  });
});
