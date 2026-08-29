import { NextResponse } from 'next/server';

import {
  ADMIN_AI_ASSISTANT_JOB_ORIGIN,
  allowedAdminBackgroundJobTypes,
  listAdminBackgroundJobs,
} from '../../../../lib/ai-background-jobs';
import { auth } from '../../../../lib/auth';
import { publishAiTaskTerminalMessage } from '../../../../lib/ai-task-followups';
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
  await Promise.allSettled(
    jobs
      .filter(
        (job) => job.conversationId && ['completed', 'cancelled', 'failed'].includes(job.status),
      )
      .map((job) =>
        publishAiTaskTerminalMessage({
          conversationId: job.conversationId ?? undefined,
          jobId: job.id,
          kind: job.kind,
          status: job.status as 'completed' | 'cancelled' | 'failed',
          progress: job.progress,
          summary: job.resultSummary,
          errorMessage: job.errorMessage,
          downloadPath: job.downloadPath,
        }),
      ),
  );
  return NextResponse.json({ jobs });
}
