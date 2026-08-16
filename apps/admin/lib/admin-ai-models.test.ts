import { describe, expect, it } from 'vitest';

import {
  getDefaultAdminAiReasoningEffort,
  resolveAdminAiModel,
  supportsAdminAiReasoningEffort,
} from './admin-ai-models';

describe('admin AI model selection', () => {
  it('uses OpenRouter model slugs and explicit reasoning effort', () => {
    expect(resolveAdminAiModel('deepseek-v4-flash', 'high')).toEqual({
      model: 'deepseek/deepseek-v4-flash',
      telemetryModel: 'deepseek/deepseek-v4-flash',
      openRouterRequestBody: { reasoning: { effort: 'high' } },
    });
    expect(resolveAdminAiModel('gpt-5.6-luna', 'medium')).toEqual({
      model: 'openai/gpt-5.6-luna',
      telemetryModel: 'openai/gpt-5.6-luna',
      openRouterRequestBody: { reasoning: { effort: 'medium' } },
    });
  });

  it('pins the fast model to Baidu Qianfan FP8 without fallbacks', () => {
    expect(resolveAdminAiModel('deepseek-v4-flash-fast', 'xhigh')).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      telemetryModel: 'deepseek/deepseek-v4-flash@baidu/fp8',
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
    });
  });

  it('keeps effort choices within each model capability', () => {
    expect(supportsAdminAiReasoningEffort('deepseek-v4-flash', 'low')).toBe(false);
    expect(supportsAdminAiReasoningEffort('gpt-5.6-luna', 'low')).toBe(true);
    expect(getDefaultAdminAiReasoningEffort('deepseek-v4-flash-fast')).toBe('high');
    expect(() => resolveAdminAiModel('deepseek-v4-flash', 'medium')).toThrow('not supported');
  });
});
