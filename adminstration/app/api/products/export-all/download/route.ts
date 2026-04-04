import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';

import { auth } from '../../../../../lib/auth';
import { ADMIN_PRODUCT_EXPORT_QUEUE, getLatestExportJob } from '../../../../../lib/background-jobs';
import { canExportAllProducts } from '../../../../../lib/permissions';

function getRequesterKey(session: Session | null) {
  return session?.user?.id ?? session?.user?.email ?? null;
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canExportAllProducts(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requesterKey = getRequesterKey(session);
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!requesterKey || !jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const job = await getLatestExportJob(ADMIN_PRODUCT_EXPORT_QUEUE, requesterKey);
  if (!job || job.id !== jobId || !job.downloadPath) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }

  return NextResponse.redirect(job.downloadPath);
}
