import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { hasUnexpectedNextAction } from '@bric/runtime/next-action';

import { routing } from './i18n/routing';
import { resolveLegacyTaxonomyRedirect } from './lib/catalog-redirect';
import { fetchStorefrontCatalogMeta } from './lib/storefront-api';

const handleInternationalizedRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  if (hasUnexpectedNextAction(request.headers)) {
    return NextResponse.json({ error: 'Unsupported request protocol' }, { status: 400 });
  }

  const match = request.nextUrl.pathname.match(/^\/(fr|ar)\/products\/?$/);
  if (match) {
    const values = Object.fromEntries(request.nextUrl.searchParams.entries());
    const redirectPath = await resolveLegacyTaxonomyRedirect(
      match[1] as 'fr' | 'ar',
      values,
      fetchStorefrontCatalogMeta,
    );
    if (redirectPath) return NextResponse.redirect(new URL(redirectPath, request.url), 308);
  }
  return handleInternationalizedRouting(request);
}

export const config = {
  matcher: ['/', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
