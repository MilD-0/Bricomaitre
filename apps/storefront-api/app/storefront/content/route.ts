import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontAnnouncements } from '@bric/db/schema';

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale');
  if (locale !== 'fr' && locale !== 'ar') {
    return NextResponse.json({ error: 'Invalid locale.' }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ announcement: null });
  const db = getDb();
  const announcements = await db
    .select({ message: storefrontAnnouncements.message })
    .from(storefrontAnnouncements)
    .where(
      and(eq(storefrontAnnouncements.locale, locale), eq(storefrontAnnouncements.active, true)),
    )
    .limit(1);
  return NextResponse.json({ announcement: announcements[0] ?? null });
}
