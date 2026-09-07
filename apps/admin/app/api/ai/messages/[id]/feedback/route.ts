import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { requireAppAccess } from '@/lib/rbac';

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const feedbackSchema = z.object({ feedback: z.enum(['helpful', 'not_helpful']) }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireAppAccess();
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

  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const db = getDb();
  const feedbackAt = new Date().toISOString();
  const [message] = await db
    .update(aiMessages)
    .set({
      content: sql`${aiMessages.content} || ${JSON.stringify({
        feedback: feedback.data.feedback,
        feedbackAt,
      })}::jsonb`,
    })
    .where(
      and(
        eq(aiMessages.id, params.data.id),
        eq(aiMessages.role, 'assistant'),
        inArray(
          aiMessages.conversationId,
          db
            .select({ id: aiConversations.id })
            .from(aiConversations)
            .where(and(eq(aiConversations.surface, 'admin'), eq(aiConversations.actorId, owner))),
        ),
      ),
    )
    .returning({ id: aiMessages.id });
  if (!message)
    return NextResponse.json({ error: 'Assistant message not found.' }, { status: 404 });
  return NextResponse.json({ messageId: message.id, feedback: feedback.data.feedback, feedbackAt });
}
