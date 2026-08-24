import { NextResponse } from 'next/server';

import {
  ADMIN_AI_ASSISTANT_JOB_ORIGIN,
  allowedAdminBackgroundJobTypes,
  listAdminBackgroundJobs,
} from '../../../../lib/ai-background-jobs';
import { auth } from '../../../../lib/auth';
import { normalizePermissions } from '../../../../lib/permissions';
import { requireAppAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireAppAccess();
  if (denied) return denied;
  const session = await auth();
  const allowedJobTypes = allowedAdminBackgroundJobTypes(
    normalizePermissions(session?.user?.permissions),
  );
  const jobs = await listAdminBackgroundJobs(30, allowedJobTypes, {
    origin: ADMIN_AI_ASSISTANT_JOB_ORIGIN,
  });
  return NextResponse.json({ jobs });
}
