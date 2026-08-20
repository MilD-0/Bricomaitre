import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';

import { requireMutationAccess } from '../../../../../lib/rbac';
import { SearchConsoleSyncError, syncSearchConsole } from '../../../../../lib/search-console';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inputSchema = z
  .object({ since: dateSchema.optional(), until: dateSchema.optional() })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.since) !== Boolean(value.until)) {
      context.addIssue({
        code: 'custom',
        message: 'since and until must be provided together.',
      });
    }
    if (value.since && value.until && value.since > value.until) {
      context.addIssue({ code: 'custom', message: 'since must not follow until.' });
    }
  });

export async function POST(request: Request) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const raw = await request.text();
  const body = raw
    ? await Promise.resolve()
        .then(() => JSON.parse(raw))
        .catch(() => null)
    : {};
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await syncSearchConsole({
      since: parsed.data.since,
      until: parsed.data.until,
      trigger: 'analytics2',
      inspectionLimit: 10,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof SearchConsoleSyncError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status && error.status >= 400 ? error.status : 502 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search Console sync failed.' },
      { status: 502 },
    );
  }
}
