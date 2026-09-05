import { z } from 'zod';
import type { AiProvider } from '@bric/ai-core/config';

export const ADMIN_AI_MODEL_OPTIONS = [
  {
    id: 'deepseek-v4-flash',
    model: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    cost: '$',
    pricing: { inputPer1MUsd: 0.09, outputPer1MUsd: 0.18 },
    reasoningEfforts: ['high', 'xhigh'],
  },
  {
    id: 'deepseek-v4-flash-fast',
    model: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash (Fast)',
    cost: '$$',
    pricing: { inputPer1MUsd: 0.0983, outputPer1MUsd: 0.1966 },
    reasoningEfforts: ['high', 'xhigh'],
    provider: {
      order: ['baidu/fp8'],
      only: ['baidu/fp8'],
      allow_fallbacks: false,
      require_parameters: true,
      quantizations: ['fp8'],
    },
  },
  {
    id: 'gpt-5.6-luna',
    model: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    cost: '$$$',
    pricing: { inputPer1MUsd: 1, outputPer1MUsd: 6 },
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
] as const;

export const ADMIN_AI_DEFAULT_MODEL = 'gpt-5.6-luna';
export const ADMIN_AI_DEFAULT_REASONING_EFFORT = 'medium';

export const adminAiModelIdSchema = z.enum(
  ADMIN_AI_MODEL_OPTIONS.map((option) => option.id) as [
    (typeof ADMIN_AI_MODEL_OPTIONS)[number]['id'],
    ...(typeof ADMIN_AI_MODEL_OPTIONS)[number]['id'][],
  ],
);
export const adminAiReasoningEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh']);

export type AdminAiModelId = z.infer<typeof adminAiModelIdSchema>;
export type AdminAiReasoningEffort = z.infer<typeof adminAiReasoningEffortSchema>;

export function getAdminAiModelOption(modelId: AdminAiModelId) {
  return ADMIN_AI_MODEL_OPTIONS.find((option) => option.id === modelId)!;
}

export function supportsAdminAiReasoningEffort(
  modelId: AdminAiModelId,
  effort: AdminAiReasoningEffort,
) {
  const option = getAdminAiModelOption(modelId);
  return (option.reasoningEfforts as readonly string[]).includes(effort);
}

export function getDefaultAdminAiReasoningEffort(modelId: AdminAiModelId): AdminAiReasoningEffort {
  const option = getAdminAiModelOption(modelId);
  return supportsAdminAiReasoningEffort(modelId, ADMIN_AI_DEFAULT_REASONING_EFFORT)
    ? ADMIN_AI_DEFAULT_REASONING_EFFORT
    : option.reasoningEfforts[0];
}

export function getAdminAiModelOptions(provider: string | undefined) {
  return ADMIN_AI_MODEL_OPTIONS.filter(
    (option) => provider !== 'experientiallabs' || !('provider' in option),
  );
}

export function resolveAdminAiModel(
  modelId: AdminAiModelId,
  effort: AdminAiReasoningEffort,
  activeProvider: AiProvider = 'openrouter',
) {
  if (!supportsAdminAiReasoningEffort(modelId, effort)) {
    throw new Error(`Reasoning effort ${effort} is not supported by ${modelId}.`);
  }
  const option = getAdminAiModelOption(modelId);
  if (activeProvider === 'experientiallabs') {
    if ('provider' in option)
      throw new Error('This model route requires OpenRouter. Select DeepSeek V4 Flash instead.');
    const model = option.model.split('/').at(-1)!;
    return {
      model,
      telemetryModel: `experientiallabs/${model}`,
      chatRequestBody: { reasoning_effort: effort },
    };
  }
  const provider = 'provider' in option ? option.provider : undefined;
  return {
    model: option.model,
    telemetryModel: provider ? `${option.model}@baidu/fp8` : option.model,
    chatRequestBody: {
      reasoning: { effort },
      ...(provider ? { provider } : {}),
    },
  };
}

export function getAdminAiModelPricing(model: string) {
  const option = ADMIN_AI_MODEL_OPTIONS.find((candidate) => {
    const provider = 'provider' in candidate ? candidate.provider : undefined;
    const telemetryModel = provider ? `${candidate.model}@baidu/fp8` : candidate.model;
    return telemetryModel === model;
  });
  return option?.pricing ?? null;
}
