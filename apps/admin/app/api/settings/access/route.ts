import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { userAccessGrants } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { loadAdministrationAccessGrants } from '../../../../lib/admin-administration-data';
import { auth } from '../../../../lib/auth';
import { userAccessGrantFormSchema } from '../../../../lib/permissions';
import { isConfiguredPrivilegedEmail } from '../../../../lib/role-config';
import { requireSettingsAccess } from '../../../../lib/rbac';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isReservedPrivilegedEmail(email: string) {
  return isConfiguredPrivilegedEmail(normalizeEmail(email));
}

export async function GET() {
  const denied = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  return NextResponse.json(await loadAdministrationAccessGrants());
}

export async function POST(req: NextRequest) {
  const denied = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = userAccessGrantFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const email = normalizeEmail(data.email);

  if (isReservedPrivilegedEmail(email)) {
    return NextResponse.json(
      { error: 'Privileged bootstrap emails are managed in code.' },
      { status: 409 },
    );
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.email, email),
  });

  if (existing) {
    return NextResponse.json({ error: 'Access grant already exists' }, { status: 409 });
  }

  await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    operation: 'create',
    actor,
    execute: (tx) =>
      tx
        .insert(userAccessGrants)
        .values({
          email,
          role: data.role ?? 'viewer',
          roleDefinitionId: data.roleDefinitionId ?? null,
        })
        .returning({ id: userAccessGrants.id }),
    resolveEntityId: (rows) => rows[0]?.id,
  });

  return NextResponse.json({ ok: true });
}
