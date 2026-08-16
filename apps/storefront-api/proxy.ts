import { NextResponse, type NextRequest } from 'next/server';

import { hasUnexpectedNextAction } from '@bric/runtime/next-action';

export function proxy(request: NextRequest) {
  if (hasUnexpectedNextAction(request.headers)) {
    return NextResponse.json({ error: 'Unsupported request protocol' }, { status: 400 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
