import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const optionalModel = z.string().trim().min(1).optional();

export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().trim().min(1).optional(),
  adminModel: optionalModel,
  storefrontModel: optionalModel,
  contentModel: optionalModel,
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AiTask = 'admin' | 'storefront' | 'content';

function isTruthy(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return aiConfigSchema.parse({
    enabled: isTruthy(env.AI_ENABLED),
    apiKey: env.OPENAI_API_KEY || undefined,
    adminModel: env.AI_ADMIN_MODEL || undefined,
    storefrontModel: env.AI_STOREFRONT_MODEL || undefined,
    contentModel: env.AI_CONTENT_MODEL || undefined,
    requestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(env.AI_MAX_RETRIES ?? 2),
  });
}

export function assertAiConfigured(config: AiConfig) {
  if (!config.enabled) {
    throw new Error('AI is disabled');
  }
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
}

export function resolveAiModel(config: AiConfig, task: AiTask) {
  const model = task === 'storefront'
    ? config.storefrontModel
    : task === 'content'
      ? config.contentModel
      : config.adminModel;

  if (!model) {
    throw new Error(`AI_${task.toUpperCase()}_MODEL is not configured`);
  }

  return model;
}

export function createOpenAiResponsesModel(config: AiConfig, task: AiTask) {
  assertAiConfigured(config);
  const provider = createOpenAI({ apiKey: config.apiKey });
  return provider.responses(resolveAiModel(config, task));
}
