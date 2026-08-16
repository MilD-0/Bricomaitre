import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { auth } from '../../../../../lib/auth';
import { requireAiUseAccess } from '../../../../../lib/rbac';

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

function messageText(content: unknown) {
  if (typeof content === 'string') return content;
  if (
    content &&
    typeof content === 'object' &&
    typeof (content as { text?: unknown }).text === 'string'
  ) {
    return (content as { text: string }).text;
  }
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAiUseAccess();
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
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversation.id))
    .orderBy(asc(aiMessages.createdAt))
    .limit(200);
  const messages = rows.flatMap((row) => {
    const content = messageText(row.content);
    return content && (row.role === 'user' || row.role === 'assistant')
      ? [{ role: row.role, content }]
      : [];
  });

  return NextResponse.json({ conversation, messages });
}
