import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { loadAdministrationAccessGrants } from '../../../../lib/admin-administration-data';
import { userAccessGrantFormSchema } from '../../../../lib/permissions';
import { requireSettingsAccess } from '../../../../lib/rbac';
import {
  AccessGrantAlreadyExistsError,
  PrivilegedAccessManagedInCodeError,
  createAdministrationAccessGrant,
} from '../../../../lib/administration-mutations';

export async function GET() {
  const { response: denied } = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  return NextResponse.json(await loadAdministrationAccessGrants());
}

export async function POST(req: NextRequest) {
  const { response: denied, session } = await requireSettingsAccess();
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

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await createAdministrationAccessGrant(db, parsed.data, actor);
  } catch (error) {
    if (error instanceof PrivilegedAccessManagedInCodeError) {
      return NextResponse.json(
        { error: 'Privileged bootstrap emails are managed in code.' },
        { status: 409 },
      );
    }
    if (error instanceof AccessGrantAlreadyExistsError) {
      return NextResponse.json({ error: 'Access grant already exists' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
