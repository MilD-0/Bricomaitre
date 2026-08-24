import { NextRequest, NextResponse } from 'next/server';
import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { userAccessGrantFormSchema } from '../../../../../lib/permissions';
import { requireSettingsAccess } from '../../../../../lib/rbac';
import {
  AccessGrantNotFoundError,
  deleteAdministrationAccessGrant,
  PrivilegedAccessManagedInCodeError,
  updateAdministrationAccessGrant,
} from '../../../../../lib/administration-mutations';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const grantId = parsePositiveIntegerId(id);
  if (grantId === null) {
    return NextResponse.json({ error: 'Invalid access grant id' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await updateAdministrationAccessGrant(db, grantId, parsed.data, actor);
  } catch (error) {
    if (error instanceof PrivilegedAccessManagedInCodeError) {
      return NextResponse.json(
        { error: 'Privileged bootstrap emails are managed in code.' },
        { status: 409 },
      );
    }
    if (error instanceof AccessGrantNotFoundError) {
      return NextResponse.json({ error: 'Access grant not found' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const grantId = parsePositiveIntegerId(id);
  if (grantId === null) {
    return NextResponse.json({ error: 'Invalid access grant id' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await deleteAdministrationAccessGrant(db, grantId, actor);
  } catch (error) {
    if (error instanceof PrivilegedAccessManagedInCodeError) {
      return NextResponse.json(
        { error: 'Privileged bootstrap emails are managed in code.' },
        { status: 409 },
      );
    }
    if (error instanceof AccessGrantNotFoundError) {
      return NextResponse.json({ error: 'Access grant not found' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
