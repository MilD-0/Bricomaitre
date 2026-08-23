import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { auth } from '../../../../../lib/auth';
import { ADMIN_AI_CONTEXT_QUERY_LIMIT } from '../../../../../lib/admin-ai-conversation-context';
import { requireAppAccess } from '../../../../../lib/rbac';

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const renameSchema = z.object({ title: z.string().trim().min(1).max(80) }).strict();

function messageContent(content: unknown) {
  if (typeof content === 'string') return { text: content };
  if (
    content &&
    typeof content === 'object' &&
    typeof (content as { text?: unknown }).text === 'string'
  ) {
    const saved = content as {
      text: string;
      toolResults?: unknown;
      feedback?: 'helpful' | 'not_helpful';
    };
    return {
      text: saved.text,
      ...('toolResults' in saved ? { toolResults: saved.toolResults } : {}),
      ...(saved.feedback === 'helpful' || saved.feedback === 'not_helpful'
        ? { feedback: saved.feedback }
        : {}),
    };
  }
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid conversation.' }, { status: 400 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const db = getDb();
  const [conversation] = await db
    .select({
      id: aiConversations.id,
      sessionKey: aiConversations.sessionKey,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, parsed.data.id),
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.actorId, owner),
      ),
    )
    .limit(1);
  if (!conversation)
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const rows = await db
    .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversation.id))
    .orderBy(desc(aiMessages.createdAt))
    .limit(ADMIN_AI_CONTEXT_QUERY_LIMIT);
  const messages = rows.reverse().flatMap((row) => {
    const content = messageContent(row.content);
    return content && (row.role === 'user' || row.role === 'assistant')
      ? [
          {
            role: row.role,
            content: content.text,
            messageRecordId: row.id,
            ...(row.role === 'assistant' && 'toolResults' in content
              ? { toolResults: content.toolResults }
              : {}),
            ...(row.role === 'assistant' && 'feedback' in content
              ? { feedback: content.feedback }
              : {}),
          },
        ]
      : [];
  });

  return NextResponse.json({ conversation, messages });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const [params, body] = await Promise.all([
    context.params.then((value) => paramsSchema.safeParse(value)),
    request.json().catch(() => null),
  ]);
  const title = renameSchema.safeParse(body);
  if (!params.success || !title.success)
    return NextResponse.json({ error: 'Invalid conversation rename.' }, { status: 400 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const [conversation] = await getDb()
    .update(aiConversations)
    .set({ title: title.data.title, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.id, params.data.id),
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.actorId, owner),
      ),
    )
    .returning({
      id: aiConversations.id,
      sessionKey: aiConversations.sessionKey,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    });
  if (!conversation)
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid conversation.' }, { status: 400 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const [conversation] = await getDb()
    .delete(aiConversations)
    .where(
      and(
        eq(aiConversations.id, parsed.data.id),
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.actorId, owner),
      ),
    )
    .returning({ id: aiConversations.id });
  if (!conversation)
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ deleted: true, id: conversation.id });
}
