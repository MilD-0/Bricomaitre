import { NextResponse } from 'next/server';

import { loadAssetsMetaData } from '../../../../lib/admin-assets-data';
import { requireAppAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireAppAccess();
  if (denied) {
    return denied;
  }

  return NextResponse.json(await loadAssetsMetaData());
}
