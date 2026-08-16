import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { userAccessGrants } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { auth } from '../../../../../lib/auth';
import { userAccessGrantFormSchema } from '../../../../../lib/permissions';
import { isConfiguredPrivilegedEmail } from '../../../../../lib/role-config';
import { requireOpsAccess } from '../../../../../lib/rbac';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isReservedPrivilegedEmail(email: string) {
  return isConfiguredPrivilegedEmail(normalizeEmail(email));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOpsAccess();
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

  const { id } = await params;
  const grantId = Number(id);
  const email = normalizeEmail(parsed.data.email);

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
    where: eq(userAccessGrants.id, grantId),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Access grant not found' }, { status: 404 });
  }

  await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    entityId: grantId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(userAccessGrants)
        .set({
          email,
          role: parsed.data.role ?? 'viewer',
          roleDefinitionId: parsed.data.roleDefinitionId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userAccessGrants.id, grantId)),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOpsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const grantId = Number(id);
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.id, grantId),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Access grant not found' }, { status: 404 });
  }

  await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    entityId: grantId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(userAccessGrants).where(eq(userAccessGrants.id, grantId)),
  });

  return NextResponse.json({ ok: true });
}
