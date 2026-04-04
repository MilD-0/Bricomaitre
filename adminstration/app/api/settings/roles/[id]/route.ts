import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../../db/client';
import { roleDefinitionPermissions, roleDefinitions } from '../../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { auth } from '../../../../../lib/auth';
import { roleDefinitionFormSchema } from '../../../../../lib/permissions';
import { requireOpsAccess } from '../../../../../lib/rbac';

function slugifyRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOpsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = roleDefinitionFormSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const roleId = Number(id);
  const data = parsed.data;
  const description = data.description?.trim() ? data.description.trim() : null;
  const slug = slugifyRoleName(data.name);
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  const existing = await db.query.roleDefinitions.findFirst({
    where: eq(roleDefinitions.id, roleId),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  }

  await mutateEntityWithHistory(db, {
    entityType: 'roleDefinitions',
    entityId: roleId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      await tx
        .update(roleDefinitions)
        .set({
          name: data.name.trim(),
          slug,
          description,
          updatedAt: new Date(),
        })
        .where(eq(roleDefinitions.id, roleId));

      await tx.delete(roleDefinitionPermissions).where(eq(roleDefinitionPermissions.roleId, roleId));
      await tx.insert(roleDefinitionPermissions).values(
        data.permissions.map((permission) => ({
          roleId,
          permission,
        })),
      );
    },
  });

  return NextResponse.json({ ok: true });
}
