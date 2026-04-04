import { NextRequest, NextResponse } from 'next/server';

import { getRequestId, withRequestIdHeaders } from './sentry';

const DEFAULT_STOREFRONT_API_BASE_URL = 'http://localhost:3001';
const FORWARDED_HEADER_NAMES = ['accept', 'content-type', 'x-order-token'] as const;

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getStorefrontApiBaseUrl() {
  return normalizeBaseUrl(process.env.STOREFRONT_API_BASE_URL ?? DEFAULT_STOREFRONT_API_BASE_URL);
}

function getForwardedHeaders(request?: NextRequest) {
  const headers = new Headers();

  if (!request) {
    return headers;
  }

  for (const headerName of FORWARDED_HEADER_NAMES) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  return headers;
}

function buildStorefrontApiUrl(pathname: string, request?: NextRequest) {
  const url = new URL(`${getStorefrontApiBaseUrl()}${pathname}`);

  if (request?.nextUrl.search) {
    url.search = request.nextUrl.search;
  }

  return url.toString();
}

function toGatewayErrorResponse(requestId: string) {
  return NextResponse.json(
    {
      error: 'Storefront API is unavailable',
    },
    { status: 502, headers: withRequestIdHeaders(requestId) },
  );
}

export async function proxyStorefrontRequest(options: {
  pathname: string,
  method: 'GET' | 'POST' | 'PATCH',
  request?: NextRequest,
}) {
  const { pathname, method, request } = options;
  const requestId = getRequestId(request);

  try {
    const upstreamResponse = await fetch(buildStorefrontApiUrl(pathname, request), {
      method,
      headers: getForwardedHeaders(request),
      body: request && method !== 'GET' ? await request.text() : undefined,
    });

    const bodyText = await upstreamResponse.text();
    const headers = new Headers();
    const contentType = upstreamResponse.headers.get('content-type');

    if (contentType) {
      headers.set('content-type', contentType);
    }

    headers.set('x-request-id', upstreamResponse.headers.get('x-request-id') ?? requestId);

    return new NextResponse(bodyText, {
      status: upstreamResponse.status,
      headers,
    });
  } catch {
    return toGatewayErrorResponse(requestId);
  }
}
