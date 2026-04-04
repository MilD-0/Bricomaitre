import type { NextRequest } from 'next/server';

type RequestLike = Pick<NextRequest, 'nextUrl' | 'url'> | Request | undefined;

export function getRequestSearchParams(request?: RequestLike) {
  if (request && 'nextUrl' in request && request.nextUrl) {
    return request.nextUrl.searchParams;
  }

  if (request?.url) {
    return new URL(request.url).searchParams;
  }

  return new URLSearchParams();
}
