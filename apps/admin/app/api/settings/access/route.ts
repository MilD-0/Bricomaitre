import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { roleDefinitions, userAccessGrants } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { userAccessGrantFormSchema } from '../../../../lib/permissions';
import { isConfiguredPrivilegedEmail } from '../../../../lib/role-config';
import { requireOpsAccess } from '../../../../lib/rbac';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isReservedPrivilegedEmail(email: string) {
  return isConfiguredPrivilegedEmail(normalizeEmail(email));
}

async function loadAccessGrants() {
  const db = getDb();
  const [grants, customRoles] = await Promise.all([
    db.select().from(userAccessGrants).orderBy(asc(userAccessGrants.email)),
    db
      .select({ id: roleDefinitions.id, name: roleDefinitions.name })
      .from(roleDefinitions)
      .orderBy(asc(roleDefinitions.name)),
  ]);

  return {
    items: grants.map((grant) => ({
      ...grant,
      roleLabel: grant.roleDefinitionId
        ? (customRoles.find((role) => role.id === grant.roleDefinitionId)?.name ?? null)
        : null,
    })),
    availableBuiltInRoles: ['viewer', 'employee'] as const,
    availableCustomRoles: customRoles,
  };
}

export async function GET() {
  const denied = await requireOpsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  return NextResponse.json(await loadAccessGrants());
}

export async function POST(req: NextRequest) {
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
