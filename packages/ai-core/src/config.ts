import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const optionalModel = z.string().trim().min(1).optional();
const optionalUrl = z.string().trim().url().optional();

export const aiProviderSchema = z.enum(['openai', 'openrouter']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderSchema,
  apiKey: z.string().trim().min(1).optional(),
  adminModel: optionalModel,
  storefrontModel: optionalModel,
  contentModel: optionalModel,
  openRouterBaseUrl: optionalUrl,
  openRouterReferer: optionalUrl,
  openRouterTitle: z.string().trim().min(1).max(200).optional(),
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AiTask = 'admin' | 'storefront' | 'content';

function isTruthy(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = aiProviderSchema.parse(env.AI_PROVIDER?.trim().toLowerCase() || 'openai');
  return aiConfigSchema.parse({
    enabled: isTruthy(env.AI_ENABLED),
    provider,
    apiKey: provider === 'openrouter'
      ? env.OPENROUTER_API_KEY || undefined
      : env.OPENAI_API_KEY || undefined,
    adminModel: env.AI_ADMIN_MODEL || undefined,
    storefrontModel: env.AI_STOREFRONT_MODEL || undefined,
    contentModel: env.AI_CONTENT_MODEL || undefined,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL || undefined,
    openRouterReferer: env.OPENROUTER_HTTP_REFERER || undefined,
    openRouterTitle: env.OPENROUTER_APP_TITLE || undefined,
    requestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(env.AI_MAX_RETRIES ?? 2),
  });
}

export function assertAiConfigured(config: AiConfig) {
  if (!config.enabled) {
    throw new Error('AI is disabled');
  }
  if (!config.apiKey) {
    throw new Error(`${config.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'} is not configured`);
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

export function createAiLanguageModel(config: AiConfig, task: AiTask) {
  assertAiConfigured(config);
  const model = resolveAiModel(config, task);

  if (config.provider === 'openrouter') {
    const headers: Record<string, string> = {};
    if (config.openRouterReferer) headers['HTTP-Referer'] = config.openRouterReferer;
    if (config.openRouterTitle) headers['X-OpenRouter-Title'] = config.openRouterTitle;
    const provider = createOpenAI({
      name: 'openrouter',
      apiKey: config.apiKey,
      baseURL: config.openRouterBaseUrl ?? 'https://openrouter.ai/api/v1',
      headers,
    });
    return provider.chat(model);
  }

  return createOpenAI({ apiKey: config.apiKey }).responses(model);
}

/** @deprecated Use createAiLanguageModel. */
export const createOpenAiResponsesModel = createAiLanguageModel;
