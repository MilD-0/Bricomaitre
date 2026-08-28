import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { generateText, stepCountIs, streamText, tool, type ToolSet } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages, aiRuns, aiToolCalls } from '@bric/db/schema';

import {
  ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
  ADMIN_AI_CHAT_PROMPT_VERSION,
  type AdminAiGuidanceTopic,
  adminAiApplicationDate,
  adminAiChatRequestSchema,
  adminAiCompletedMutationNarrationFailure,
  adminAiConversationTitle,
  adminAiGuidanceRequestSchemaForTopics,
  adminAiReliableAnswerFailure,
  adminAiRuntimeInstructions,
  adminAiToolErrorCode,
  readAdminAiGuidanceForTopics,
} from '../../../../lib/admin-ai-runtime';
import {
  ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
  ADMIN_AI_INSPECT_ARCHIVED_PRODUCTS_TOOL_DESCRIPTION,
  ADMIN_AI_INSPECT_PRODUCTS_TOOL_DESCRIPTION,
  adminAiArchivedCatalogProductInspectionSchema,
  adminAiCatalogProductInspectionSchema,
  adminAiCatalogProductLookupSchema,
  findAdminCatalogProducts,
  inspectAdminArchivedCatalogProducts,
  inspectAdminCatalogProducts,
} from '../../../../lib/admin-ai-catalog';
import {
  ADMIN_AI_FIND_BRANDS_TOOL_DESCRIPTION,
  ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION,
  ADMIN_AI_QUERY_PRODUCTS_TOOL_DESCRIPTION,
  adminAiBrandQuerySchema,
  adminAiCatalogQuerySchema,
  adminAiCategoryQuerySchema,
  queryAdminBrands,
  queryAdminCatalogProducts,
  queryAdminCategories,
} from '../../../../lib/admin-ai-catalog-query';
import {
  adminAiProductArchiveSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
  archiveAdminAiProducts,
  createAdminAiProduct,
  restoreAdminAiProducts,
  updateAdminAiProducts,
} from '../../../../lib/admin-ai-products';
import {
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryStateSchema,
  adjustAdminInventory,
  updateAdminInventoryState,
} from '../../../../lib/admin-ai-inventory';
import {
  adminAiTaxonomyMutationSchema,
  manageAdminAiTaxonomy,
} from '../../../../lib/admin-ai-taxonomy';
import {
  ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION,
  ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION,
  adminAiOrderInspectionSchema,
  adminAiOrderQuerySchema,
  inspectAdminOrderDetails,
  queryAdminOrders,
} from '../../../../lib/admin-ai-order-query';
import {
  ADMIN_AI_INSPECT_ECOTRACK_SHIPMENTS_TOOL_DESCRIPTION,
  adminAiEcotrackShipmentInspectionSchema,
  inspectAdminAiEcotrackShipments,
} from '../../../../lib/admin-ai-ecotrack-shipments';
import {
  ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
  ADMIN_AI_PRESENTATION_TOOL_NAME,
  adminAiPresentationPlanSchema,
} from '../../../../lib/admin-ai-presentation';
import {
  ADMIN_AI_STATS_TOOL_DESCRIPTION,
  adminAiStatsQuerySchema,
  queryAdminAiStats,
} from '../../../../lib/admin-ai-ai-stats';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
  manageAdminAiAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource,
  updateAdminAiAnalyticsSettings,
} from '../../../../lib/admin-ai-analytics-actions';
import { adminAiAnalyticsQuerySchema, queryAdminAnalytics } from '../../../../lib/ai-analytics';
import { auth } from '../../../../lib/auth';
import {
  adminAiChatStreamEventSchema,
  type AdminAiChatStreamEvent,
} from '../../../../lib/admin-ai-chat-stream';
import {
  ADMIN_AI_CONTEXT_QUERY_LIMIT,
  buildAdminAiConversationContext,
} from '../../../../lib/admin-ai-conversation-context';
import { adminAiContextMessage } from '../../../../lib/admin-ai-capabilities';
import { ADMIN_AI_MAX_OUTPUT_TOKENS, resolveAdminAiModel } from '../../../../lib/admin-ai-models';
import { normalizePermissions } from '../../../../lib/permissions';
import { productPayloadSchema } from '../../../../lib/products';
import { requireAppAccess } from '../../../../lib/rbac';
import { adminAiToolMutatesApplication } from '../../../../lib/admin-ai-execution-capabilities';

const ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION = [
  'Read canonical live Analytics evidence.',
  'Results include metric meanings, dates, coverage, estimation, sources, and warnings. Use focus for useful underlying rows and sourceCoverage for the exact EcoTrack denominator and missing eligible orders.',
].join(' ');

function interruptedAnswer(locale: 'en' | 'fr' | 'ar', partialText: string) {
  const marker =
    locale === 'fr'
      ? 'Cette réponse s’est arrêtée avant d’être terminée.'
      : locale === 'ar'
        ? 'توقفت هذه الإجابة قبل اكتمالها.'
        : 'This response stopped before completion.';
  return partialText.trim() ? `${partialText.trim()}\n\n${marker}` : marker;
}

type ToolTrace = {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  input: unknown;
  output?: unknown;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
};

type AdminAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function combineUsage(...values: Array<AdminAiUsage | undefined>): AdminAiUsage {
  const total = (key: keyof AdminAiUsage) =>
    values.reduce((sum, value) => sum + (value?.[key] ?? 0), 0);
  return {
    inputTokens: total('inputTokens'),
    outputTokens: total('outputTokens'),
    totalTokens: total('totalTokens'),
  };
}

function repeatableStreamText<TOOLS extends ToolSet>(
  options: Parameters<typeof streamText<TOOLS>>[0],
) {
  return () => streamText(options);
}

function synthesisEvidence(value: unknown) {
  const serialized = JSON.stringify(value);
  const limit = 24_000;
  if (serialized.length <= limit) return serialized;
  return `${serialized.slice(0, limit)}\n[…tool evidence truncated for final synthesis]`;
}

function hasSuccessfulMutation(toolResults: unknown[]) {
  return toolResults.some((result) => {
    if (!result || typeof result !== 'object') return false;
    const record = result as Record<string, unknown>;
    if (record.type !== 'tool-result' || typeof record.toolName !== 'string') return false;
    if (!adminAiToolMutatesApplication(record.toolName)) return false;
    return Boolean(
      record.output &&
      typeof record.output === 'object' &&
      (record.output as { ok?: unknown }).ok === true,
    );
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = adminAiChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI chat request.' }, { status: 400 });
  }

  let runId: number | null = null;
  try {
    const session = await auth();
    const actorId = session?.user?.email;
    if (!actorId) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const permissions = normalizePermissions(session.user.permissions);
    const actor = { email: actorId, name: session.user.name };
    const db = getDb();
    const config = getAiConfig();
    if (config.provider !== 'openrouter') {
      return NextResponse.json(
        { error: 'The admin AI model selector requires OpenRouter.' },
        { status: 503 },
      );
    }

    const selectedModel = resolveAdminAiModel(parsed.data.model, parsed.data.reasoningEffort);
    const model = selectedModel.telemetryModel;
    const now = new Date();
    const title = adminAiConversationTitle(parsed.data.message);
    const [existingConversation] = await db
      .select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.surface, 'admin'),
          eq(aiConversations.sessionKey, parsed.data.conversationKey),
          eq(aiConversations.actorId, actorId),
        ),
      )
      .limit(1);
    const conversation =
      existingConversation ??
      (
        await db
          .insert(aiConversations)
          .values({
            surface: 'admin',
            actorId,
            sessionKey: parsed.data.conversationKey,
            title,
          })
          .returning({ id: aiConversations.id, title: aiConversations.title })
      )[0];
    const previousRows = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(desc(aiMessages.createdAt))
      .limit(ADMIN_AI_CONTEXT_QUERY_LIMIT);
    const previousMessages = buildAdminAiConversationContext(previousRows);
    const effectiveTitle = previousMessages.length === 0 ? title : conversation.title || title;

    await Promise.all([
      db.insert(aiMessages).values({
        conversationId: conversation.id,
        role: 'user',
        content: { text: parsed.data.message },
      }),
      db
        .update(aiConversations)
        .set({ title: effectiveTitle, updatedAt: now })
        .where(eq(aiConversations.id, conversation.id)),
    ]);

    try {
      const [run] = await db
        .insert(aiRuns)
        .values({
          conversationId: conversation.id,
          surface: 'admin',
          task: 'admin_chat',
          status: 'running',
          model,
          promptVersion: ADMIN_AI_CHAT_PROMPT_VERSION,
          actorId,
        })
        .returning({ id: aiRuns.id });
      runId = run.id;
    } catch {
      // Telemetry is non-blocking for an otherwise healthy assistant turn.
    }

    const locale = parsed.data.context?.locale ?? 'en';
    const currentDate = adminAiApplicationDate(now);
    const instructions = adminAiRuntimeInstructions({ locale, currentDate });
    const messages = [
      ...previousMessages,
      ...(parsed.data.context
        ? [{ role: 'user' as const, content: adminAiContextMessage(parsed.data.context) }]
        : []),
      { role: 'user' as const, content: parsed.data.message },
    ];
    const languageModel = createAiLanguageModel(config, 'admin', {
      model: selectedModel.model,
      openRouterRequestBody: selectedModel.openRouterRequestBody,
    });
    const hasAnalytics = permissions.includes('analytics_manage');
    const hasCatalogLookup =
      permissions.includes('products_write') ||
      permissions.includes('orders_write') ||
      permissions.includes('assets_write') ||
      permissions.includes('brands_categories_write');
    const hasTaxonomyLookup =
      permissions.includes('products_write') ||
      permissions.includes('assets_write') ||
      permissions.includes('brands_categories_write');
    const canInspectProducts = permissions.includes('products_write');
    const hasOrders = permissions.includes('orders_write');
    const canMutateTaxonomy = permissions.includes('brands_categories_write');
    const guidanceTopics: AdminAiGuidanceTopic[] = [
      ...(hasAnalytics
        ? ([
            'analytics_profit',
            'analytics_order_lifecycle',
            'analytics_sources_and_coverage',
            'analytics_dates_and_comparisons',
            'analytics_storefront_and_attribution',
            'ai_stats_operations',
            'ai_stats_shopping',
          ] satisfies AdminAiGuidanceTopic[])
        : []),
      ...(hasCatalogLookup ? (['catalog'] satisfies AdminAiGuidanceTopic[]) : []),
      ...(hasOrders ? (['orders'] satisfies AdminAiGuidanceTopic[]) : []),
    ];
    const permittedGuidanceTopics = guidanceTopics as [
      AdminAiGuidanceTopic,
      ...AdminAiGuidanceTopic[],
    ];
    const hasEvidenceTools = hasAnalytics || hasCatalogLookup || hasOrders;
    const tools = {
      ...(guidanceTopics.length > 0
        ? {
            read_system_guidance: tool({
              description: ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
              inputSchema: adminAiGuidanceRequestSchemaForTopics(permittedGuidanceTopics),
              execute: (input) => readAdminAiGuidanceForTopics(permittedGuidanceTopics, input),
            }),
          }
        : {}),
      ...(hasCatalogLookup
        ? {
            find_products: tool({
              description: ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
              inputSchema: adminAiCatalogProductLookupSchema,
              execute: findAdminCatalogProducts,
            }),
          }
        : {}),
      ...(hasTaxonomyLookup
        ? {
            find_brands: tool({
              description: ADMIN_AI_FIND_BRANDS_TOOL_DESCRIPTION,
              inputSchema: adminAiBrandQuerySchema,
              execute: (input) => queryAdminBrands(input),
            }),
            find_categories: tool({
              description: ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION,
              inputSchema: adminAiCategoryQuerySchema,
              execute: (input) => queryAdminCategories(input),
            }),
          }
        : {}),
      ...(canInspectProducts
        ? {
            query_products: tool({
              description: ADMIN_AI_QUERY_PRODUCTS_TOOL_DESCRIPTION,
              inputSchema: adminAiCatalogQuerySchema,
              execute: (input) => queryAdminCatalogProducts(input),
            }),
            inspect_products: tool({
              description: ADMIN_AI_INSPECT_PRODUCTS_TOOL_DESCRIPTION,
              inputSchema: adminAiCatalogProductInspectionSchema,
              execute: inspectAdminCatalogProducts,
            }),
            inspect_archived_products: tool({
              description: ADMIN_AI_INSPECT_ARCHIVED_PRODUCTS_TOOL_DESCRIPTION,
              inputSchema: adminAiArchivedCatalogProductInspectionSchema,
              execute: inspectAdminArchivedCatalogProducts,
            }),
            create_product: tool({
              description:
                'Create one product. Title and selling price are required; omitted catalog fields use their normal defaults. Returns the saved product.',
              inputSchema: productPayloadSchema,
              execute: (product) => createAdminAiProduct({ product }, actor),
            }),
            update_products: tool({
              description:
                'Change specified fields on exact current product IDs. Omitted fields are preserved; returns previous values for the changed fields.',
              inputSchema: adminAiProductUpdateSchema,
              execute: (input) => updateAdminAiProducts(input, actor),
            }),
            archive_products: tool({
              description:
                'Archive exact current product IDs. Their records, inventory, and taxonomy assignments are retained.',
              inputSchema: adminAiProductArchiveSchema,
              execute: (input) => archiveAdminAiProducts(input, actor),
            }),
            restore_products: tool({
              description:
                'Restore exact archived product IDs. Restore only removes archive state; it does not reactivate or restock them.',
              inputSchema: adminAiProductRestoreSchema,
              execute: (input) => restoreAdminAiProducts(input, actor),
            }),
            adjust_inventory: tool({
              description:
                'Increase or decrease inventory quantities for exact product IDs by positive deltas. Returns previous and resulting quantities.',
              inputSchema: adminAiInventoryAdjustmentSchema,
              execute: (input) => adjustAdminInventory(input, actor),
            }),
            update_inventory_state: tool({
              description:
                'Set in-stock state or barcode on exact product IDs. This does not change inventory quantity.',
              inputSchema: adminAiInventoryStateSchema,
              execute: (input) => updateAdminInventoryState(input, actor),
            }),
          }
        : {}),
      ...(canMutateTaxonomy
        ? {
            manage_taxonomy: tool({
              description:
                'Create, update, or delete one brand or category through the canonical catalog workflow.',
              inputSchema: adminAiTaxonomyMutationSchema,
              execute: (input) => manageAdminAiTaxonomy(input, actor),
            }),
          }
        : {}),
      ...(hasOrders
        ? {
            query_orders: tool({
              description: ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION,
              inputSchema: adminAiOrderQuerySchema,
              execute: queryAdminOrders,
            }),
            inspect_orders: tool({
              description: ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION,
              inputSchema: adminAiOrderInspectionSchema,
              execute: inspectAdminOrderDetails,
            }),
            inspect_ecotrack_shipments: tool({
              description: ADMIN_AI_INSPECT_ECOTRACK_SHIPMENTS_TOOL_DESCRIPTION,
              inputSchema: adminAiEcotrackShipmentInspectionSchema,
              execute: inspectAdminAiEcotrackShipments,
            }),
          }
        : {}),
      ...(hasAnalytics
        ? {
            query_analytics: tool({
              description: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
              inputSchema: adminAiAnalyticsQuerySchema,
              execute: queryAdminAnalytics,
            }),
            query_ai_stats: tool({
              description: ADMIN_AI_STATS_TOOL_DESCRIPTION,
              inputSchema: adminAiStatsQuerySchema,
              execute: queryAdminAiStats,
            }),
            update_analytics_settings: tool({
              description:
                'Change the canonical planning return rate and return the persisted before and after values.',
              inputSchema: adminAiAnalyticsSettingsPatchSchema,
              execute: (input) => updateAdminAiAnalyticsSettings(input),
            }),
            manage_analytics_costs: tool({
              description:
                'Create, update, or delete exact operating-cost records used by true profit. Updates preserve omitted fields and return a persisted outcome for each requested operation.',
              inputSchema: adminAiAnalyticsCostsMutationSchema,
              execute: (input) => manageAdminAiAnalyticsCosts(input),
            }),
            manage_analytics_day_overrides: tool({
              description:
                'Set or reset exact calculator-day overrides for gross profit, planning return rate, confirmed orders, or an operator note. Omitted fields stay unchanged and null clears a named value.',
              inputSchema: adminAiAnalyticsDayOverridesMutationSchema,
              execute: (input) => manageAdminAiAnalyticsDayOverrides(input),
            }),
            sync_analytics_source: tool({
              description:
                'Synchronize an exact Meta or Search Console date range through the canonical integration. Meta ranges are limited to 90 days; returns the source operation result.',
              inputSchema: adminAiAnalyticsSyncSchema,
              execute: (input) => syncAdminAiAnalyticsSource(input),
            }),
          }
        : {}),
      ...(hasEvidenceTools
        ? {
            [ADMIN_AI_PRESENTATION_TOOL_NAME]: tool({
              description: ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
              inputSchema: adminAiPresentationPlanSchema.omit({ kind: true }),
              execute: async (input) =>
                adminAiPresentationPlanSchema.parse({ kind: 'admin_ui_blocks_v1', ...input }),
            }),
          }
        : {}),
    } satisfies ToolSet;
    const createResult = repeatableStreamText({
      model: languageModel,
      instructions,
      messages,
      tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(8),
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(config.requestTimeoutMs)]),
      maxRetries: config.maxRetries,
      maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: AdminAiChatStreamEvent) => {
          controller.enqueue(
            encoder.encode(`${JSON.stringify(adminAiChatStreamEventSchema.parse(event))}\n`),
          );
        };
        write({ type: 'status', status: 'thinking' });

        void (async () => {
          let text = '';
          const toolResults: unknown[] = [];
          const toolTraces = new Map<string, ToolTrace>();
          let anonymousToolCall = 0;
          let emptyStreamRetryCount = 0;
          let usage: AdminAiUsage = {};
          try {
            while (true) {
              try {
                for await (const part of createResult().stream) {
                  if (part.type === 'tool-call') {
                    const toolCallId = part.toolCallId || `${part.toolName}:${anonymousToolCall++}`;
                    toolTraces.set(toolCallId, {
                      toolCallId,
                      toolName: part.toolName,
                      status: 'running',
                      input: part.input,
                      startedAt: new Date(),
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'running',
                    });
                  }
                  if (part.type === 'tool-result') {
                    toolResults.push(part);
                    const completedAt = new Date();
                    const current = toolTraces.get(part.toolCallId);
                    toolTraces.set(part.toolCallId, {
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      status: 'completed',
                      input: part.input,
                      output: part.output,
                      startedAt: current?.startedAt ?? completedAt,
                      completedAt,
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'completed',
                    });
                  }
                  if (part.type === 'tool-error') {
                    const completedAt = new Date();
                    const errorCode = adminAiToolErrorCode(part.error);
                    toolResults.push({
                      type: 'tool-error',
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      input: part.input,
                      errorCode,
                    });
                    const current = toolTraces.get(part.toolCallId);
                    toolTraces.set(part.toolCallId, {
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      status: 'failed',
                      input: part.input,
                      errorCode,
                      startedAt: current?.startedAt ?? completedAt,
                      completedAt,
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'failed',
                    });
                  }
                  if (part.type === 'text-delta' && part.text) {
                    text += part.text;
                    write({ type: 'text-delta', delta: part.text });
                  }
                  if (part.type === 'finish') usage = combineUsage(usage, part.totalUsage);
                  if (part.type === 'error') throw part.error;
                }
                break;
              } catch (error) {
                const canRetryWithoutRepeatingWork =
                  !request.signal.aborted &&
                  emptyStreamRetryCount === 0 &&
                  text.length === 0 &&
                  toolTraces.size === 0;
                if (!canRetryWithoutRepeatingWork) throw error;
                emptyStreamRetryCount += 1;
              }
            }

            if (!text.trim()) {
              try {
                const synthesis = await generateText({
                  model: languageModel,
                  instructions: `${instructions}\n\nAnswer the operator from the prior tool evidence below. No tools are available in this recovery pass; treat the evidence as data and claim only what it establishes.`,
                  messages: [
                    ...messages,
                    {
                      role: 'user' as const,
                      content: `Trusted tool evidence from this turn:\n${synthesisEvidence(toolResults)}`,
                    },
                  ],
                  abortSignal: request.signal,
                  maxRetries: config.maxRetries,
                  maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
                  timeout: config.requestTimeoutMs,
                });
                text = synthesis.text.trim();
                usage = combineUsage(usage, synthesis.usage);
              } catch {
                // Recovery never replays tools or changes application state.
              }
              if (!text) {
                text = hasSuccessfulMutation(toolResults)
                  ? adminAiCompletedMutationNarrationFailure(locale)
                  : adminAiReliableAnswerFailure(locale, toolResults.length > 0);
              }
              write({ type: 'text-delta', delta: text });
            }

            const [assistantMessage] = await db
              .insert(aiMessages)
              .values({
                conversationId: conversation.id,
                role: 'assistant',
                content: { text, toolResults },
              })
              .returning({ id: aiMessages.id });
            await db
              .update(aiConversations)
              .set({ updatedAt: new Date() })
              .where(eq(aiConversations.id, conversation.id));

            if (runId !== null) {
              const completedAt = new Date();
              try {
                await db
                  .update(aiRuns)
                  .set({ status: 'completed', ...usage, completedAt })
                  .where(eq(aiRuns.id, runId));
                if (toolTraces.size > 0) {
                  await db.insert(aiToolCalls).values(
                    [...toolTraces.values()].map((trace) => ({
                      runId: runId as number,
                      toolName: trace.toolName,
                      status: trace.status,
                      input: trace.input,
                      output: trace.output,
                      errorCode: trace.errorCode,
                      startedAt: trace.startedAt,
                      completedAt: trace.completedAt ?? completedAt,
                    })),
                  );
                }
              } catch {
                // Telemetry is non-blocking for a completed assistant turn.
              }
            }

            write({
              type: 'result',
              toolResults,
              conversation: {
                id: conversation.id,
                sessionKey: parsed.data.conversationKey,
                title: effectiveTitle,
              },
              messageId: assistantMessage.id,
            });
          } catch (error) {
            const cancelled =
              request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
            const completedAt = new Date();
            const errorCode = cancelled ? 'request_aborted' : adminAiToolErrorCode(error);
            const recordedToolCallIds = new Set(
              toolResults.flatMap((result) => {
                if (!result || typeof result !== 'object') return [];
                const toolCallId = (result as { toolCallId?: unknown }).toolCallId;
                return typeof toolCallId === 'string' ? [toolCallId] : [];
              }),
            );
            for (const trace of toolTraces.values()) {
              if (trace.status !== 'running' || recordedToolCallIds.has(trace.toolCallId)) continue;
              toolResults.push({
                type: 'tool-error',
                toolCallId: trace.toolCallId,
                toolName: trace.toolName,
                input: trace.input,
                errorCode,
              });
            }
            const failureText = cancelled
              ? interruptedAnswer(locale, text)
              : text.trim()
                ? interruptedAnswer(locale, text)
                : hasSuccessfulMutation(toolResults)
                  ? adminAiCompletedMutationNarrationFailure(locale)
                  : adminAiReliableAnswerFailure(locale, toolResults.length > 0);
            let assistantMessageId: number | null = null;
            try {
              const [assistantMessage] = await db
                .insert(aiMessages)
                .values({
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: {
                    text: failureText,
                    toolResults,
                    outcome: { status: cancelled ? 'cancelled' : 'failed', errorCode },
                  },
                })
                .returning({ id: aiMessages.id });
              assistantMessageId = assistantMessage.id;
              await db
                .update(aiConversations)
                .set({ updatedAt: completedAt })
                .where(eq(aiConversations.id, conversation.id));
            } catch {
              // The live error remains visible even if durable conversation storage is unavailable.
            }
            if (runId !== null) {
              await Promise.all([
                db
                  .update(aiRuns)
                  .set({
                    status: cancelled ? 'cancelled' : 'failed',
                    errorCode,
                    completedAt,
                  })
                  .where(eq(aiRuns.id, runId)),
                toolTraces.size > 0
                  ? db.insert(aiToolCalls).values(
                      [...toolTraces.values()].map((trace) => ({
                        runId: runId as number,
                        toolName: trace.toolName,
                        status:
                          trace.status === 'running'
                            ? cancelled
                              ? 'cancelled'
                              : 'failed'
                            : trace.status,
                        input: trace.input,
                        output: trace.output,
                        errorCode:
                          trace.errorCode ??
                          (trace.status === 'running'
                            ? cancelled
                              ? 'request_aborted'
                              : errorCode
                            : undefined),
                        startedAt: trace.startedAt,
                        completedAt: trace.completedAt ?? completedAt,
                      })),
                    )
                  : Promise.resolve(),
              ]).catch(() => undefined);
            }
            if (!request.signal.aborted) {
              write({
                type: 'error',
                code: 'admin_ai_failed',
                message: failureText,
                conversation: {
                  id: conversation.id,
                  sessionKey: parsed.data.conversationKey,
                  title: effectiveTitle,
                },
                messageId: assistantMessageId,
                ...(toolResults.length > 0 ? { toolResults } : {}),
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
    if (runId !== null) {
      const cancelled =
        request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      await getDb()
        .update(aiRuns)
        .set({
          status: cancelled ? 'cancelled' : 'failed',
          errorCode: cancelled ? 'request_aborted' : adminAiToolErrorCode(error),
          completedAt: new Date(),
        })
        .where(eq(aiRuns.id, runId))
        .catch(() => undefined);
    }
    if (
      error instanceof Error &&
      (error.message === 'AI is disabled' || error.message.includes('is not configured'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Admin AI chat failed.' }, { status: 502 });
  }
}
