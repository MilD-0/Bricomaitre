import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

import { buildAdminPageContentSecurityPolicy } from './lib/content-security-policy';
import { defaultLocale, locales } from './lib/i18n';

const handleInternationalizedRouting = createMiddleware({ locales, defaultLocale });

export default function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildAdminPageContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = handleInternationalizedRouting(
    new NextRequest(request, { headers: requestHeaders }),
  );
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const config = { matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'] };
