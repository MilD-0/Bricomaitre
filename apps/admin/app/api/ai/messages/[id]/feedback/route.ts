import { and, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { auth } from '../../../../../../lib/auth';
import { requireAppAccess } from '../../../../../../lib/rbac';

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const feedbackSchema = z.object({ feedback: z.enum(['helpful', 'not_helpful']) }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const [params, body] = await Promise.all([
    context.params.then((value) => paramsSchema.safeParse(value)),
    request.json().catch(() => null),
  ]);
  const feedback = feedbackSchema.safeParse(body);
  if (!params.success || !feedback.success)
    return NextResponse.json({ error: 'Invalid assistant feedback.' }, { status: 400 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const [ownedMessage] = await getDb()
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(
      and(
        eq(aiMessages.id, params.data.id),
        eq(aiMessages.role, 'assistant'),
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.actorId, owner),
      ),
    )
    .limit(1);
  if (!ownedMessage)
    return NextResponse.json({ error: 'Assistant message not found.' }, { status: 404 });

  const feedbackAt = new Date().toISOString();
  const [message] = await getDb()
    .update(aiMessages)
    .set({
      content: sql`${aiMessages.content} || ${JSON.stringify({
        feedback: feedback.data.feedback,
        feedbackAt,
      })}::jsonb`,
    })
    .where(eq(aiMessages.id, ownedMessage.id))
    .returning({ id: aiMessages.id });
  if (!message)
    return NextResponse.json({ error: 'Assistant message not found.' }, { status: 404 });
  return NextResponse.json({ messageId: message.id, feedback: feedback.data.feedback, feedbackAt });
}
