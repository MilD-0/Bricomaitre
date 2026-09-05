import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_DEFAULT_REASONING_EFFORT,
  getDefaultAdminAiReasoningEffort,
  getAdminAiModelOptions,
  resolveAdminAiModel,
  supportsAdminAiReasoningEffort,
} from './admin-ai-models';

describe('admin AI model selection', () => {
  it('resolves ExperientialLabs slugs and reasoning without OpenRouter route controls', () => {
    expect(resolveAdminAiModel('gpt-5.6-luna', 'medium', 'experientiallabs')).toEqual({
      model: 'gpt-5.6-luna',
      telemetryModel: 'experientiallabs/gpt-5.6-luna',
      chatRequestBody: { reasoning_effort: 'medium' },
    });
    expect(resolveAdminAiModel('deepseek-v4-flash', 'high', 'experientiallabs')).toMatchObject({
      model: 'deepseek-v4-flash',
      chatRequestBody: { reasoning_effort: 'high' },
    });
    expect(getAdminAiModelOptions('experientiallabs').map((option) => option.id)).toEqual([
      'deepseek-v4-flash',
      'gpt-5.6-luna',
    ]);
    expect(() => resolveAdminAiModel('deepseek-v4-flash-fast', 'high', 'experientiallabs')).toThrow(
      'requires OpenRouter',
    );
  });
  it('defaults the operating assistant to GPT-5.6 Luna at balanced reasoning', () => {
    expect(ADMIN_AI_DEFAULT_MODEL).toBe('gpt-5.6-luna');
    expect(ADMIN_AI_DEFAULT_REASONING_EFFORT).toBe('medium');
  });

  it('uses OpenRouter model slugs and explicit reasoning effort', () => {
    expect(resolveAdminAiModel('deepseek-v4-flash', 'high')).toEqual({
      model: 'deepseek/deepseek-v4-flash',
      telemetryModel: 'deepseek/deepseek-v4-flash',
      chatRequestBody: { reasoning: { effort: 'high' } },
    });
    expect(resolveAdminAiModel('gpt-5.6-luna', 'medium')).toEqual({
      model: 'openai/gpt-5.6-luna',
      telemetryModel: 'openai/gpt-5.6-luna',
      chatRequestBody: { reasoning: { effort: 'medium' } },
    });
  });

  it('pins the fast model to Baidu Qianfan FP8 without fallbacks', () => {
    expect(resolveAdminAiModel('deepseek-v4-flash-fast', 'xhigh')).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      telemetryModel: 'deepseek/deepseek-v4-flash@baidu/fp8',
      chatRequestBody: {
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
