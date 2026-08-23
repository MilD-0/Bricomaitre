import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';
import { auth } from '../../../../lib/auth';
import { requireAppAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const session = await auth();
  const owner = session?.user?.email;
  if (!owner) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 200) ?? '';
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100))
    : 50;
  const search = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
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
        query
          ? or(
              sql`${aiConversations.title} ilike ${search} escape '\\'`,
              sql`exists (
                select 1 from ${aiMessages}
                where ${aiMessages.conversationId} = ${aiConversations.id}
                  and coalesce(${aiMessages.content} ->> 'text', '') ilike ${search} escape '\\'
              )`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(limit);

  return NextResponse.json({ conversations, query });
}
