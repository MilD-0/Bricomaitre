import { NextRequest, NextResponse } from 'next/server';
import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { roleDefinitionFormSchema } from '../../../../../lib/permissions';
import { requireSettingsAccess } from '../../../../../lib/rbac';
import {
  AdministrationRoleNotFoundError,
  updateAdministrationRoleDefinition,
} from '../../../../../lib/administration-mutations';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const roleId = parsePositiveIntegerId(id);
  if (roleId === null) {
    return NextResponse.json({ error: 'Invalid role id' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await updateAdministrationRoleDefinition(db, roleId, parsed.data, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdministrationRoleNotFoundError) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    throw error;
  }
}
