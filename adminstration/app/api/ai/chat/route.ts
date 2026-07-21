import { createAiLanguageModel, getAiConfig, productContentFieldSchema, resolveAiModel, semanticAnalyticsComparisonSchema, semanticAnalyticsQuerySchema } from '@bric/ai-core';
import { stepCountIs, streamText, tool } from 'ai';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '../../../../db/client';
import { aiConversations, aiMessages, aiRuns, aiToolCalls, products } from '../../../../db/schema';
import { proposeProductContent } from '../../../../lib/ai-product-content';
import { ADMIN_AI_CHAT_INSTRUCTIONS } from '../../../../lib/ai-admin-chat';
import { proposeBundle, proposeDiscount, proposeEntityEdit, proposeFeaturedProducts, proposeLandingPage } from '../../../../lib/ai-admin-capabilities';
import { executeSemanticAnalytics, executeSemanticAnalyticsComparison } from '../../../../lib/ai-semantic-analytics';
import { startAiContentJob } from '../../../../lib/background-jobs';
import { auth } from '../../../../lib/auth';
import { canViewProfitStats, hasPermission, normalizePermissions } from '../../../../lib/permissions';
import { requireAiUseAccess } from '../../../../lib/rbac';
import { adminAiChatStreamEventSchema, type AdminAiChatStreamEvent } from '../../../../lib/admin-ai-chat-stream';

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  conversationKey: z.uuid(),
});

export const ADMIN_AI_CHAT_PROMPT_VERSION = 'admin-chat-v1';

function storedMessageText(content: unknown) {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }
  return null;
}

function conversationTitle(message: string) {
  const title = message.replace(/\s+/g, ' ').trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

export async function POST(request: NextRequest) {
  const denied = await requireAiUseAccess();
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid AI chat request.' }, { status: 400 });

  let runId: number | null = null;
  try {
    const session = await auth();
    const actor = { email: session?.user?.email, name: session?.user?.name };
    const actorId = actor.email;
    if (!actorId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const permissions = normalizePermissions(session?.user?.permissions);
    const db = getDb();
    const config = getAiConfig();
    const model = resolveAiModel(config, 'admin');
    const now = new Date();
    const title = conversationTitle(parsed.data.message);
    const [existingConversation] = await db.select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(and(
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.sessionKey, parsed.data.conversationKey),
        eq(aiConversations.actorId, actorId),
      ))
      .limit(1);
    const conversation = existingConversation ?? (await db.insert(aiConversations).values({
      surface: 'admin',
      actorId,
      sessionKey: parsed.data.conversationKey,
      title,
    }).returning({ id: aiConversations.id, title: aiConversations.title }))[0];
    const previousRows = await db.select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(desc(aiMessages.createdAt))
      .limit(20);
    const previousMessages = previousRows.reverse().flatMap((row): Array<{ role: 'user' | 'assistant'; content: string }> => {
      const content = storedMessageText(row.content);
      return content && (row.role === 'user' || row.role === 'assistant')
        ? [{ role: row.role, content }]
        : [];
    });
    const effectiveTitle = previousMessages.length === 0 ? title : (conversation.title || title);
    await Promise.all([
      db.insert(aiMessages).values({ conversationId: conversation.id, role: 'user', content: { text: parsed.data.message } }),
      db.update(aiConversations).set({ title: effectiveTitle, updatedAt: now }).where(eq(aiConversations.id, conversation.id)),
    ]);

    try {
      const [run] = await db.insert(aiRuns).values({
        conversationId: conversation.id,
        surface: 'admin',
        task: 'admin_chat',
        status: 'running',
        model,
        promptVersion: ADMIN_AI_CHAT_PROMPT_VERSION,
        actorId,
      }).returning({ id: aiRuns.id });
      runId = run.id;
    } catch {
      // AI telemetry must never prevent the assistant from answering.
    }
    const result = streamText({
      model: createAiLanguageModel(config, 'admin'),
      instructions: ADMIN_AI_CHAT_INSTRUCTIONS,
      messages: [...previousMessages, { role: 'user', content: parsed.data.message }],
      stopWhen: stepCountIs(6),
      tools: {
        find_products: tool({
          description: 'Find active products by title or SKU before performing a catalog action.',
          inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(10) }),
          execute: async ({ query, limit }) => db.select({ id: products.id, title: products.title, sku: products.sku })
            .from(products)
            .where(and(eq(products.active, true), or(ilike(products.title, `%${query}%`), ilike(products.sku, `%${query}%`))))
            .limit(limit),
        }),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { generate_product_content: tool({
          description: 'Create reviewable product-content proposals for explicit products or every active product missing requested fields. Does not apply changes.',
          inputSchema: z.object({
            scope: z.enum(['explicit', 'all_missing']),
            productIds: z.array(z.number().int().positive()).max(100).default([]),
            fields: z.array(productContentFieldSchema).min(1),
            context: z.string().trim().max(2_000).optional(),
          }),
          execute: async ({ scope, productIds, fields, context }) => {
            if (scope === 'explicit' && productIds.length === 0) return { error: 'At least one resolved product is required.' };
            if (scope === 'explicit' && productIds.length <= 5) {
              const proposals = [];
              for (const productId of productIds) {
                proposals.push(await proposeProductContent({ productId, fields, adminContext: context, actorId: actor.email }));
              }
              return { kind: 'proposals', proposals };
            }
            const started = await startAiContentJob(actor.email ?? 'unknown-admin', {
              productIds: scope === 'all_missing' ? null : productIds,
              fields,
              onlyMissing: scope === 'all_missing',
              context,
              actor,
            });
            return started;
          },
        }) } : {}),
        ...(hasPermission(permissions, 'ai_analytics_query') ? { query_analytics: tool({
          description: 'Run one read-only semantic analytics query over catalog, sales, orders, funnel, product/category/brand performance, inventory, promotions, bundles, or content gaps. Dates use YYYY-MM-DD. Raw SQL is never accepted.',
          inputSchema: semanticAnalyticsQuerySchema,
          execute: (input) => executeSemanticAnalytics(input, { canViewProfit: canViewProfitStats(session?.user?.role) }),
        }), compare_analytics_periods: tool({
          description: 'Compare two explicit, bounded date periods for sales, submitted orders, storefront funnel, or promotion performance. Returns current, previous, and calculated deltas. Raw SQL is never accepted.',
          inputSchema: semanticAnalyticsComparisonSchema,
          execute: (input) => executeSemanticAnalyticsComparison(input, { canViewProfit: canViewProfitStats(session?.user?.role) }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_pricing_analyze') ? {
          suggest_discount: tool({
            description: 'Create a reviewable margin-safe product discount proposal.',
            inputSchema: z.object({ productId: z.number().int().positive(), percentOff: z.number().positive().max(90), minimumMargin: z.number().min(0).max(0.95).optional() }),
            execute: (input) => proposeDiscount({ ...input, actorId: actor.email }),
          }),
          suggest_bundle: tool({
            description: 'Create a reviewable proposal for a new inactive bundle product listing.',
            inputSchema: z.object({ title: z.string().trim().min(1).max(240), titleAr: z.string().trim().max(240).optional(), components: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(100) })).min(2).max(30), minimumMargin: z.number().min(0).max(0.95).optional() }),
            execute: (input) => proposeBundle({ ...input, actorId: actor.email }),
          }),
        } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { suggest_featured_products: tool({
          description: 'Create a reviewable inactive featured product group using deterministic performance ranking.',
          inputSchema: z.object({ name: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(30).default(8) }),
          execute: (input) => proposeFeaturedProducts({ ...input, actorId: actor.email }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { suggest_landing_page: tool({
          description: 'Create a distinct, conversion-focused and reviewable landing-page draft grounded in verified product data and registered performance-bounded blocks. Price, stock, assets, and technical claims remain protected.',
          inputSchema: z.object({ productId: z.number().int().positive(), locale: z.enum(['fr', 'ar']), campaignAngle: z.string().trim().max(2_000).optional() }),
          execute: (input) => proposeLandingPage({ ...input, actorId: actor.email }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { propose_entity_edit: tool({
          description: 'Propose restricted field edits to a product, brand, or category. Never directly applies them.',
          inputSchema: z.object({ entityType: z.enum(['products', 'brands', 'categories']), entityId: z.number().int().positive(), changes: z.record(z.string(), z.unknown()) }),
          execute: (input) => proposeEntityEdit({ ...input, actorId: actor.email }),
        }) } : {}),
      },
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: AdminAiChatStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(adminAiChatStreamEventSchema.parse(event))}\n`));
        };
        write({ type: 'status', status: 'thinking' });
        void (async () => {
          let text = '';
          const toolResults: unknown[] = [];
          const toolNames: string[] = [];
          let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
          try {
            for await (const part of result.stream) {
              if (part.type === 'tool-call') {
                toolNames.push(part.toolName);
                write({ type: 'status', status: 'working' });
              }
              if (part.type === 'tool-result') toolResults.push(part);
              if (part.type === 'text-delta' && part.text) {
                text += part.text;
                write({ type: 'text-delta', delta: part.text });
              }
              if (part.type === 'finish') usage = part.totalUsage;
              if (part.type === 'error') throw part.error;
            }
            if (!text.trim()) {
              text = 'Completed.';
              write({ type: 'text-delta', delta: text });
            }
            await Promise.all([
              db.insert(aiMessages).values({ conversationId: conversation.id, role: 'assistant', content: { text } }),
              db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversation.id)),
            ]);
            if (runId !== null) {
              const completedRunId = runId;
              const completedAt = new Date();
              try {
                await db.update(aiRuns).set({ status: 'completed', ...usage, completedAt }).where(eq(aiRuns.id, completedRunId));
                if (toolNames.length > 0) {
                  await db.insert(aiToolCalls).values(toolNames.map((toolName) => ({ runId: completedRunId, toolName, status: 'completed', completedAt })));
                }
              } catch {
                // AI telemetry must never replace a successful assistant response.
              }
            }
            write({
              type: 'result',
              toolResults,
              conversation: { id: conversation.id, sessionKey: parsed.data.conversationKey, title: effectiveTitle },
            });
          } catch (error) {
            if (runId !== null) {
              await db.update(aiRuns).set({ status: 'failed', errorCode: error instanceof Error ? error.name : 'UnknownError', completedAt: new Date() }).where(eq(aiRuns.id, runId)).catch(() => undefined);
            }
            write({ type: 'error', code: 'admin_ai_failed' });
          } finally {
            controller.close();
          }
        })();
      },
    });
    return new NextResponse(responseStream, { headers: { 'cache-control': 'no-cache, no-transform', 'content-type': 'application/x-ndjson; charset=utf-8', 'x-accel-buffering': 'no' } });
  } catch (error) {
    if (runId !== null) {
      await getDb().update(aiRuns).set({
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'UnknownError',
        completedAt: new Date(),
      }).where(eq(aiRuns.id, runId)).catch(() => undefined);
    }
    if (error instanceof Error && (error.message === 'AI is disabled' || error.message.includes('is not configured'))) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Admin AI chat failed.' }, { status: 502 });
  }
}
