import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { auth } from '../../../../lib/auth';
import { requireAppAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const conversations = await getDb()
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
        eq(aiConversations.surface, 'admin'),
        eq(aiConversations.actorId, owner),
        isNotNull(aiConversations.sessionKey),
        sql`exists (select 1 from ${aiMessages} where ${aiMessages.conversationId} = ${aiConversations.id})`,
      ),
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(30);

  return NextResponse.json({ conversations });
}
