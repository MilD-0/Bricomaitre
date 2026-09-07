import { createOpenAI } from '@ai-sdk/openai';
import { APICallError } from 'ai';
import { z } from 'zod';

const optionalModel = z.string().trim().min(1).optional();
const optionalUrl = z.string().trim().url().optional();
const optionalPositiveInteger = z.number().int().positive().optional();

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
  requestTimeoutMs: z.number().int().min(1_000).optional(),
  adminRequestTimeoutMs: z.number().int().min(1_000).optional(),
  contentRequestTimeoutMs: z.number().int().min(1_000).optional(),
  landingPageRequestTimeoutMs: z.number().int().min(1_000).optional(),
  adminMaxSteps: optionalPositiveInteger,
  adminMaxOutputTokens: optionalPositiveInteger,
  adminContextCharacterLimit: optionalPositiveInteger,
  adminToolEvidenceCharacterLimit: optionalPositiveInteger,
  adminSynthesisEvidenceCharacterLimit: optionalPositiveInteger,
  adminAnalyticsArrayLimit: optionalPositiveInteger,
  adminAnalyticsStringLimit: optionalPositiveInteger,
  adminAnalyticsMaxDepth: optionalPositiveInteger,
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

function optionalNumber(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? Number(normalized) : undefined;
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
    requestTimeoutMs: optionalNumber(env.AI_REQUEST_TIMEOUT_MS),
    adminRequestTimeoutMs: optionalNumber(env.AI_ADMIN_REQUEST_TIMEOUT_MS),
    contentRequestTimeoutMs: optionalNumber(env.AI_CONTENT_REQUEST_TIMEOUT_MS),
    landingPageRequestTimeoutMs: optionalNumber(env.AI_LANDING_PAGE_REQUEST_TIMEOUT_MS),
    adminMaxSteps: optionalNumber(env.AI_ADMIN_MAX_STEPS),
    adminMaxOutputTokens: optionalNumber(env.AI_ADMIN_MAX_OUTPUT_TOKENS),
    adminContextCharacterLimit: optionalNumber(env.AI_ADMIN_CONTEXT_CHARACTER_LIMIT),
    adminToolEvidenceCharacterLimit: optionalNumber(env.AI_ADMIN_TOOL_EVIDENCE_CHARACTER_LIMIT),
    adminSynthesisEvidenceCharacterLimit: optionalNumber(
      env.AI_ADMIN_SYNTHESIS_EVIDENCE_CHARACTER_LIMIT,
    ),
    adminAnalyticsArrayLimit: optionalNumber(env.AI_ADMIN_ANALYTICS_ARRAY_LIMIT),
    adminAnalyticsStringLimit: optionalNumber(env.AI_ADMIN_ANALYTICS_STRING_LIMIT),
    adminAnalyticsMaxDepth: optionalNumber(env.AI_ADMIN_ANALYTICS_MAX_DEPTH),
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

const permanentQuotaCodes = new Set([
  'insufficient_quota',
  'free_tier_requires_payment',
  'billing_hard_limit_reached',
]);

export function isNonRetryableAiProviderError(error: unknown) {
  return APICallError.isInstance(error) && !error.isRetryable;
}

async function fetchAiProvider(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  const response = await globalThis.fetch(input, init);
  if (response.status !== 429) return response;
  const body = await response.clone().text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response;
  }
  const error = (parsed as { error?: { code?: string; type?: string } } | null)?.error;
  if (!permanentQuotaCodes.has(error?.code ?? '') && !permanentQuotaCodes.has(error?.type ?? ''))
    return response;
  // A quota/account restriction is not a transient rate limit. Keep its real
  // status and evidence while preventing the SDK from retrying an impossible request.
  throw new APICallError({
    message: 'AI provider account is unavailable. Check its quota or billing configuration.',
    url: String(input),
    requestBodyValues: undefined,
    statusCode: response.status,
    responseBody: body,
    isRetryable: false,
    data: parsed,
  });
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
            fetchAiProvider(input, {
              ...init,
              body:
                typeof init?.body === 'string'
                  ? mergeAiChatRequestBody(init.body, options.chatRequestBody!)
                  : init?.body,
            })
        : fetchAiProvider,
    });
    return provider.chat(config.provider === 'experientiallabs' ? model.split('/').at(-1)! : model);
  }

  if (config.provider === 'deepseek') {
    return createOpenAI({
      name: 'deepseek',
      apiKey: config.apiKey,
      baseURL: 'https://api.deepseek.com',
      fetch: fetchAiProvider,
    }).chat(model);
  }

  return createOpenAI({ apiKey: config.apiKey, fetch: fetchAiProvider }).responses(model);
}
