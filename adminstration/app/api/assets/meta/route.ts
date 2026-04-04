import { NextResponse } from 'next/server';

import { loadAssetsMetaData } from '../../../../lib/admin-assets-data';

export async function GET() {
  return NextResponse.json(await loadAssetsMetaData());
}
