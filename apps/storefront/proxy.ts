import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { hasUnexpectedNextAction } from '@bric/runtime/next-action';

import { routing } from './i18n/routing';
import { resolveLegacyTaxonomyRedirect } from './lib/catalog-redirect';
import { buildStorefrontContentSecurityPolicy } from './lib/content-security-policy';
import { getStorefrontImageOrigins } from './lib/product-images';
import { fetchStorefrontCatalogMeta } from './lib/storefront-api';

const handleInternationalizedRouting = createMiddleware(routing);
const imageOrigins = getStorefrontImageOrigins();

function withPageSecurity(response: NextResponse, request: NextRequest, nonce: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(
    'Content-Security-Policy',
    buildStorefrontContentSecurityPolicy(imageOrigins, nonce),
  );

  const forwardingResponse = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of forwardingResponse.headers) {
    if (name === 'x-middleware-override-headers' || name.startsWith('x-middleware-request-')) {
      response.headers.set(name, value);
    }
  }
  response.headers.set('Content-Security-Policy', requestHeaders.get('Content-Security-Policy')!);
  return response;
}

export default async function proxy(request: NextRequest) {
  if (hasUnexpectedNextAction(request.headers)) {
    return NextResponse.json({ error: 'Unsupported request protocol' }, { status: 400 });
  }

  const nonce = crypto.randomUUID().replaceAll('-', '');
  const match = request.nextUrl.pathname.match(/^\/(fr|ar)\/products\/?$/);
  if (match) {
    const values = Object.fromEntries(request.nextUrl.searchParams.entries());
    const redirectPath = await resolveLegacyTaxonomyRedirect(
      match[1] as 'fr' | 'ar',
      values,
      fetchStorefrontCatalogMeta,
    );
    if (redirectPath) {
      return withPageSecurity(
        NextResponse.redirect(new URL(redirectPath, request.url), 308),
        request,
        nonce,
      );
    }
  }
  return withPageSecurity(handleInternationalizedRouting(request), request, nonce);
}

export const config = {
  matcher: ['/', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
