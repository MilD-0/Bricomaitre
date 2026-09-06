import { NextRequest, NextResponse } from 'next/server';
import { getDb, hasDb } from '@bric/db/client';
import { loadAdministrationRoles } from '../../../../lib/admin-administration-data';
import { roleDefinitionFormSchema } from '../../../../lib/permissions';
import { requireSettingsAccess } from '../../../../lib/rbac';
import {
  AdministrationRoleAlreadyExistsError,
  createAdministrationRoleDefinition,
} from '../../../../lib/administration-mutations';

export async function GET() {
  const { response: denied } = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  return NextResponse.json(await loadAdministrationRoles());
}

export async function POST(req: NextRequest) {
  const { response: denied, session } = await requireSettingsAccess();
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

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await createAdministrationRoleDefinition(db, parsed.data, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdministrationRoleAlreadyExistsError) {
      return NextResponse.json({ error: 'Role already exists' }, { status: 409 });
    }
    throw error;
  }
}
