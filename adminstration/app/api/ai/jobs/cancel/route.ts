import { NextResponse } from 'next/server';

import { auth } from '../../../../../lib/auth';
import { ADMIN_AI_CONTENT_QUEUE, cancelExportJob } from '../../../../../lib/background-jobs';
import { requireAiAccess } from '../../../../../lib/rbac';

export async function POST() {
  const denied = await requireAiAccess('ai_catalog_propose');
  if (denied) return denied;
  const session = await auth();
  return NextResponse.json({ job: await cancelExportJob(ADMIN_AI_CONTENT_QUEUE, session?.user?.email ?? 'unknown-admin') });
}
