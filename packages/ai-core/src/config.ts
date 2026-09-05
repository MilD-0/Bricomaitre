import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const optionalModel = z.string().trim().min(1).optional();
const optionalUrl = z.string().trim().url().optional();

export const aiProviderSchema = z.enum(['openai', 'openrouter', 'deepseek', 'experientiallabs']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderSchema,
  apiKey: z.string().trim().min(1).optional(),
  adminModel: optionalModel,
  storefrontModel: optionalModel,
  contentModel: optionalModel,
  experientialLabsBaseUrl: optionalUrl,
  openRouterBaseUrl: optionalUrl,
  openRouterReferer: optionalUrl,
  openRouterTitle: z.string().trim().min(1).max(200).optional(),
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
  maxRetries: z.number().int().min(0).max(5),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;
export type AiTask = 'admin' | 'storefront' | 'content';
export type AiLanguageModelOptions = {
  model?: string;
  chatRequestBody?: Record<string, unknown>;
};

function isTruthy(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = aiProviderSchema.parse(env.AI_PROVIDER?.trim().toLowerCase() || 'openai');
  return aiConfigSchema.parse({
    enabled: isTruthy(env.AI_ENABLED),
    provider,
    apiKey:
      provider === 'openrouter'
        ? env.OPENROUTER_API_KEY || undefined
        : provider === 'experientiallabs'
          ? env.EXPLABS_API_KEY || undefined
          : provider === 'deepseek'
            ? env.DEEPSEEK_API_KEY || undefined
            : env.OPENAI_API_KEY || undefined,
    adminModel: env.AI_ADMIN_MODEL || undefined,
    storefrontModel: env.AI_STOREFRONT_MODEL || undefined,
    contentModel: env.AI_CONTENT_MODEL || undefined,
    experientialLabsBaseUrl: env.EXPLABS_BASE_URL || undefined,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL || undefined,
    openRouterReferer: env.OPENROUTER_HTTP_REFERER || undefined,
    openRouterTitle: env.OPENROUTER_APP_TITLE || undefined,
    requestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(env.AI_MAX_RETRIES ?? 5),
  });
}

export function assertAiConfigured(config: AiConfig) {
  if (!config.enabled) {
    throw new Error('AI is disabled');
  }
  if (!config.apiKey) {
    throw new Error(
      `${
        config.provider === 'openrouter'
          ? 'OPENROUTER_API_KEY'
          : config.provider === 'experientiallabs'
            ? 'EXPLABS_API_KEY'
            : config.provider === 'deepseek'
              ? 'DEEPSEEK_API_KEY'
              : 'OPENAI_API_KEY'
      } is not configured`,
    );
  }
}

export function resolveAiModel(config: AiConfig, task: AiTask) {
  const model =
    task === 'storefront'
      ? config.storefrontModel
      : task === 'content'
        ? config.contentModel
        : config.adminModel;

  if (!model) {
    throw new Error(`AI_${task.toUpperCase()}_MODEL is not configured`);
  }

  return model;
}

export function mergeAiChatRequestBody(body: string, additions: Record<string, unknown>) {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, ...additions });
}

export function createAiLanguageModel(
  config: AiConfig,
  task: AiTask,
  options: AiLanguageModelOptions = {},
) {
  assertAiConfigured(config);
  const model = options.model ?? resolveAiModel(config, task);

  if (config.provider === 'openrouter' || config.provider === 'experientiallabs') {
    const headers: Record<string, string> = {};
    if (config.provider === 'openrouter' && config.openRouterReferer)
      headers['HTTP-Referer'] = config.openRouterReferer;
    if (config.provider === 'openrouter' && config.openRouterTitle)
      headers['X-OpenRouter-Title'] = config.openRouterTitle;
    const provider = createOpenAI({
      name: config.provider,
      apiKey: config.apiKey,
      baseURL:
        config.provider === 'experientiallabs'
          ? (config.experientialLabsBaseUrl ?? 'https://api.experientiallabs.ai/v1')
          : (config.openRouterBaseUrl ?? 'https://openrouter.ai/api/v1'),
      headers,
      fetch: options.chatRequestBody
        ? (input, init) =>
            globalThis.fetch(input, {
              ...init,
              body:
                typeof init?.body === 'string'
                  ? mergeAiChatRequestBody(init.body, options.chatRequestBody!)
                  : init?.body,
            })
        : undefined,
    });
    return provider.chat(config.provider === 'experientiallabs' ? model.split('/').at(-1)! : model);
  }

  if (config.provider === 'deepseek') {
    return createOpenAI({
      name: 'deepseek',
      apiKey: config.apiKey,
      baseURL: 'https://api.deepseek.com',
    }).chat(model);
  }

  return createOpenAI({ apiKey: config.apiKey }).responses(model);
}
