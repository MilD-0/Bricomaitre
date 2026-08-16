export type RequestHeaders = Pick<Headers, 'get'>;

/**
 * Resolve the address written by the trusted edge proxy.
 *
 * Nginx overwrites x-real-ip and appends itself to x-forwarded-for. Prefer the
 * overwritten value; when it is unavailable, use the last forwarded hop so a
 * caller cannot choose the first value by sending its own header.
 */
export function getTrustedClientIp(headers: RequestHeaders) {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwardedChain = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return forwardedChain?.at(-1) || null;
}
