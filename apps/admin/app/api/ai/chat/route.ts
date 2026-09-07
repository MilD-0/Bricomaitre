import { adminAiContextMessage } from '@/lib/admin-ai-context';
import {
  ADMIN_AI_CONTEXT_QUERY_LIMIT,
  buildAdminAiConversationContext,
} from '@/lib/admin-ai-conversation-context';
import { getAdminAiModelOptions, resolveAdminAiModel } from '@/lib/admin-ai-models';
import {
  ADMIN_AI_CHAT_PROMPT_VERSION,
  adminAiApplicationDate,
  adminAiChatRequestSchema,
  adminAiConversationTitle,
  adminAiRuntimeInstructions,
  adminAiToolErrorCode,
} from '@/lib/admin-ai-runtime';
import { buildAdminAiTools } from '@/lib/admin-ai-tools';
import { createAdminAiResponseStream } from '@/lib/ai-chat/response-stream';
import { normalizePermissions } from '@/lib/permissions';
import { requireAppAccess } from '@/lib/rbac';
import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages, aiRuns } from '@bric/db/schema';
import { stepCountIs, streamText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
  const { response: denied, session } = await requireAppAccess();
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
    const actorId = session?.user?.email;
    if (!actorId) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const permissions = normalizePermissions(session.user.permissions);
    const actor = { email: actorId, name: session.user.name };
    const db = getDb();
    const config = getAiConfig();
    if (config.provider !== 'openrouter' && config.provider !== 'experientiallabs') {
      return NextResponse.json(
        { error: 'The admin assistant requires OpenRouter or ExperientialLabs.' },
        { status: 503 },
      );
    }

    if (
      !getAdminAiModelOptions(config.provider).some((option) => option.id === parsed.data.model)
    ) {
      return NextResponse.json(
        {
          error:
            'The selected model route is unavailable with the configured provider. Select another model.',
        },
        { status: 400 },
      );
    }
    const selectedModel = resolveAdminAiModel(
      parsed.data.model,
      parsed.data.reasoningEffort,
      config.provider,
    );
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
    const previousMessages = buildAdminAiConversationContext(previousRows, {
      characterLimit: config.adminContextCharacterLimit,
      toolEvidenceCharacterLimit: config.adminToolEvidenceCharacterLimit,
    });
    const effectiveTitle = previousMessages.length === 0 ? title : conversation.title || title;

    await db.transaction(async (tx) => {
      await tx.insert(aiMessages).values({
        conversationId: conversation.id,
        role: 'user',
        content: { text: parsed.data.message },
      });
      await tx
        .update(aiConversations)
        .set({ title: effectiveTitle, updatedAt: now })
        .where(eq(aiConversations.id, conversation.id));
    });

    const saveAssistantMessage = (content: (typeof aiMessages.$inferInsert)['content']) =>
      db.transaction(async (tx) => {
        const [message] = await tx
          .insert(aiMessages)
          .values({
            conversationId: conversation.id,
            role: 'assistant',
            content,
          })
          .returning({ id: aiMessages.id });
        await tx
          .update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, conversation.id));
        return message.id;
      });

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
      chatRequestBody: selectedModel.chatRequestBody,
    });
    const tools = buildAdminAiTools({
      permissions,
      locale,
      now,
      runtime: {
        kind: 'live',
        actorId,
        exportOwnerKey: session.user.id ?? actorId,
        actor,
        conversationId: conversation.id,
        autoAcceptProposals: parsed.data.autoAcceptProposals,
      },
    });
    const abortSignal = config.adminRequestTimeoutMs
      ? AbortSignal.any([request.signal, AbortSignal.timeout(config.adminRequestTimeoutMs)])
      : request.signal;
    const createResult = () =>
      streamText({
        model: languageModel,
        instructions,
        messages,
        tools,
        toolChoice: 'auto',
        stopWhen: config.adminMaxSteps ? stepCountIs(config.adminMaxSteps) : () => false,
        abortSignal,
        maxRetries: config.maxRetries,
        ...(config.adminMaxOutputTokens ? { maxOutputTokens: config.adminMaxOutputTokens } : {}),
      });

    const responseStream = createAdminAiResponseStream({
      createResult,
      request,
      languageModel,
      instructions,
      messages,
      config,
      abortSignal,
      locale,
      saveAssistantMessage,
      runId,
      db,
      conversation,
      effectiveTitle,
      conversationKey: parsed.data.conversationKey,
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
