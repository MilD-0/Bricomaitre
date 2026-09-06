import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '../../../../../lib/auth';
import {
  ADMIN_BACKGROUND_JOB_TYPES,
  allowedAdminBackgroundJobTypes,
  cancelAdminBackgroundJob,
} from '../../../../../lib/ai-background-jobs';
import {
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  cancelExportJob,
} from '../../../../../lib/background-jobs';
import { hasPermission, normalizePermissions } from '../../../../../lib/permissions';
import { requireAppAccess } from '../../../../../lib/rbac';

const requestSchema = z.union([
  z.object({ kind: z.enum(['content', 'categorization']).default('content') }).strict(),
  z.object({ type: z.enum(ADMIN_BACKGROUND_JOB_TYPES), jobId: z.string().uuid() }).strict(),
]);

export async function POST(request: NextRequest) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid AI job cancellation request.' }, { status: 400 });
  const session = await auth();
  const permissions = normalizePermissions(session?.user?.permissions);
  if ('type' in parsed.data) {
    if (!allowedAdminBackgroundJobTypes(permissions).includes(parsed.data.type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(await cancelAdminBackgroundJob(parsed.data.type, parsed.data.jobId));
  }
  if (!hasPermission(permissions, 'products_write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const queue =
    parsed.data.kind === 'categorization' ? ADMIN_AI_CATEGORIZATION_QUEUE : ADMIN_AI_CONTENT_QUEUE;
  return NextResponse.json({
    job: await cancelExportJob(queue, session?.user?.email ?? 'unknown-admin'),
  });
}
