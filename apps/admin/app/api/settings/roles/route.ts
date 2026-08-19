import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { roleDefinitionPermissions, roleDefinitions } from '@bric/db/schema';
import { auth } from '../../../../lib/auth';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import {
  permissionCatalog,
  roleDefinitionFormSchema,
  type PermissionKey,
} from '../../../../lib/permissions';
import { requireSettingsAccess } from '../../../../lib/rbac';

function slugifyRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadRoles() {
  const db = getDb();
  const [roles, permissions] = await Promise.all([
    db.select().from(roleDefinitions).orderBy(asc(roleDefinitions.name)),
    db.select().from(roleDefinitionPermissions).orderBy(asc(roleDefinitionPermissions.roleId)),
  ]);

  return roles.map((role) => ({
    ...role,
    permissions: permissions
      .filter((permission) => permission.roleId === role.id)
      .map((permission) => permission.permission) as PermissionKey[],
  }));
}

export async function GET() {
  const denied = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  return NextResponse.json({
    items: await loadRoles(),
    availablePermissions: permissionCatalog,
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = roleDefinitionFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const slug = slugifyRoleName(data.name);
  const db = getDb();
  const existing = await db.query.roleDefinitions.findFirst({
    where: eq(roleDefinitions.slug, slug),
  });

  if (existing) {
    return NextResponse.json({ error: 'Role already exists' }, { status: 409 });
  }

  const description = data.description?.trim() ? data.description.trim() : null;
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'roleDefinitions',
    operation: 'create',
    actor,
    execute: async (tx) => {
      const inserted = await tx
        .insert(roleDefinitions)
        .values({
          name: data.name.trim(),
          slug,
          description,
        })
        .returning({ id: roleDefinitions.id });

      const roleId = inserted[0]?.id;

      if (!roleId) {
        throw new Error('Role creation failed');
      }

      await tx.insert(roleDefinitionPermissions).values(
        data.permissions.map((permission) => ({
          roleId,
          permission,
        })),
      );

      return inserted;
    },
    resolveEntityId: (rows) => rows[0]?.id,
  });

  return NextResponse.json({ ok: true });
}
