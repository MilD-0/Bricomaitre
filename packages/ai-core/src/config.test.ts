import { describe, expect, it } from 'vitest';

import { assertAiConfigured, getAiConfig, resolveAiModel } from './config';

describe('AI configuration', () => {
  it('is disabled and credential-free by default', () => {
    expect(getAiConfig({})).toEqual({
      enabled: false,
      apiKey: undefined,
      adminModel: undefined,
      storefrontModel: undefined,
      contentModel: undefined,
      requestTimeoutMs: 30_000,
      maxRetries: 2,
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
  });
});
