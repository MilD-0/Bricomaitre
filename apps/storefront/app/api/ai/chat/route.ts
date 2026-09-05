import { assertAiConfigured, createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import {
  shoppingAssistantRequestSchema,
  shoppingAssistantStreamEventSchema,
  shoppingAssistantToolNameSchema,
  type ShoppingAssistantStreamEvent,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { stepCountIs, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import {
  enforceShoppingAssistantRateLimit,
  shoppingAssistantRateLimitHeaders,
} from '@/lib/shopping-assistant-rate-limit';
import {
  STOREFRONT_ASSISTANT_MAX_OUTPUT_TOKENS,
  STOREFRONT_ASSISTANT_PROMPT_VERSION,
  shoppingAssistantInstructions,
  shoppingAssistantModelMessages,
} from '@/lib/shopping-assistant-runtime';
import { buildShoppingAssistantTools } from '@/lib/shopping-assistant-tools';
import { getStorefrontAssistantSettings, recordStorefrontAssistantRun } from '@/lib/storefront-api';

type AssistantUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function modelCandidates(primary: string, fallback: string | null) {
  return [
    ...new Set(
      [primary.trim(), fallback?.trim()].filter((value): value is string => Boolean(value)),
    ),
  ];
}

function assistantErrorCode(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return 'request_aborted';
  return 'assistant_failed';
}

export async function POST(request: NextRequest) {
  let rateLimit: Awaited<ReturnType<typeof enforceShoppingAssistantRateLimit>>;
  let settings;
  let body: unknown;
  try {
    [rateLimit, settings, body] = await Promise.all([
      enforceShoppingAssistantRateLimit(request),
      getStorefrontAssistantSettings(),
      request.json().catch(() => null),
    ]);
  } catch {
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 503 });
  }

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'assistant_rate_limited' },
      { status: 429, headers: shoppingAssistantRateLimitHeaders(rateLimit) },
    );
  }
  if (!settings.aiAssistantEnabled) {
    return NextResponse.json({ error: 'assistant_disabled' }, { status: 404 });
  }

  const parsed = shoppingAssistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_assistant_request' }, { status: 400 });
  }

  try {
    const config = getAiConfig();
    assertAiConfigured(config);
    if (config.provider !== 'openrouter' && config.provider !== 'experientiallabs') {
      return NextResponse.json(
        { error: 'storefront_assistant_requires_supported_provider' },
        { status: 503 },
      );
    }

    const runtime = buildShoppingAssistantTools({ request: parsed.data, settings });
    const instructions = shoppingAssistantInstructions(parsed.data.locale);
    const messages = shoppingAssistantModelMessages(parsed.data);
    const candidates = modelCandidates(settings.aiModel, settings.aiFallbackModel);
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: ShoppingAssistantStreamEvent) => {
          if (request.signal.aborted) return;
          controller.enqueue(
            encoder.encode(`${JSON.stringify(shoppingAssistantStreamEventSchema.parse(event))}\n`),
          );
        };
        write({ type: 'status', status: 'thinking' });

        void (async () => {
          const startedAt = Date.now();
          let model = candidates[0] ?? settings.aiModel;
          let text = '';
          let usage: AssistantUsage = {};
          let toolCalls = 0;
          const toolNames: string[] = [];
          try {
            let generationError: unknown;
            for (const candidate of candidates) {
              model = candidate;
              try {
                const result = streamText({
                  model: createAiLanguageModel(config, 'storefront', { model: candidate }),
                  instructions,
                  messages,
                  tools: runtime.tools,
                  toolChoice: 'auto',
                  stopWhen: stepCountIs(12),
                  abortSignal: AbortSignal.any([
                    request.signal,
                    AbortSignal.timeout(config.requestTimeoutMs),
                  ]),
                  maxRetries: config.maxRetries,
                  maxOutputTokens: STOREFRONT_ASSISTANT_MAX_OUTPUT_TOKENS,
                });

                for await (const part of result.stream) {
                  if (part.type === 'tool-call') {
                    toolCalls += 1;
                    toolNames.push(part.toolName);
                    const name = shoppingAssistantToolNameSchema.safeParse(part.toolName);
                    if (name.success) write({ type: 'tool', name: name.data, status: 'started' });
                  }
                  if (part.type === 'tool-result' || part.type === 'tool-error') {
                    const name = shoppingAssistantToolNameSchema.safeParse(part.toolName);
                    if (name.success) {
                      write({
                        type: 'tool',
                        name: name.data,
                        status: part.type === 'tool-result' ? 'completed' : 'failed',
                      });
                    }
                  }
                  if (part.type === 'text-delta' && part.text && text.length < 4_000) {
                    const delta = part.text.slice(0, 4_000 - text.length);
                    if (delta) {
                      text += delta;
                      write({ type: 'text-delta', delta });
                    }
                  }
                  if (part.type === 'finish') usage = part.totalUsage;
                  if (part.type === 'error') throw part.error;
                }
                if (!text.trim() && toolCalls === 0) throw new Error('empty_assistant_response');
                generationError = undefined;
                break;
              } catch (error) {
                generationError = error;
                const canTryConfiguredFallback =
                  !request.signal.aborted && text.length === 0 && toolCalls === 0;
                if (!canTryConfiguredFallback) throw error;
              }
            }
            if (generationError) throw generationError;
            if (!text.trim()) throw new Error('empty_assistant_response');

            const final = runtime.result();
            write({
              type: 'result',
              products: final.products,
              cartMutations: final.cartMutations,
            });
            void recordStorefrontAssistantRun({
              telemetry: parsed.data.telemetry,
              locale: parsed.data.locale,
              status: 'completed',
              model,
              ...usage,
              durationMs: Date.now() - startedAt,
              toolCalls,
              toolNames,
              resultsCount: final.products.length,
              cartChanges: final.cartMutations.length,
              promptVersion: STOREFRONT_ASSISTANT_PROMPT_VERSION,
            }).catch(() => undefined);
          } catch (error) {
            const cancelled =
              request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
            const final = runtime.result();
            void recordStorefrontAssistantRun({
              telemetry: parsed.data.telemetry,
              locale: parsed.data.locale,
              status: cancelled ? 'cancelled' : 'failed',
              model,
              ...usage,
              durationMs: Date.now() - startedAt,
              toolCalls,
              toolNames,
              resultsCount: final.products.length,
              cartChanges: 0,
              promptVersion: STOREFRONT_ASSISTANT_PROMPT_VERSION,
              errorCode: cancelled ? 'request_aborted' : assistantErrorCode(error),
            }).catch(() => undefined);
            if (!cancelled) {
              write({
                type: 'error',
                code: 'assistant_unavailable',
                ...(final.products.length ? { products: final.products } : {}),
              });
            }
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(responseStream, {
      headers: {
        'cache-control': 'no-cache, no-transform',
        'content-type': 'application/x-ndjson; charset=utf-8',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'AI is disabled' || error.message.includes('is not configured'))
    ) {
      return NextResponse.json({ error: 'assistant_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 502 });
  }
}
