import { requests } from './mock-state.mjs';

export function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-ratelimit-limit': '120',
    'x-ratelimit-remaining': '119',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export function noContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
}

export function serviceForPath(pathname) {
  if (pathname.startsWith('/ecotrack/')) return 'ecotrack';
  if (pathname.startsWith('/meta/') || /^\/v\d+[.]\d+\//.test(pathname)) return 'meta';
  if (pathname.startsWith('/google/')) return 'google';
  if (pathname.startsWith('/tiktok/')) return 'tiktok';
  return 'demo';
}

export function requestedFailure(request, url) {
  return request.headers['x-demo-failure'] ?? url.searchParams.get('__demo_failure');
}

export function failDeterministically(response, scenario, service) {
  if (scenario === 'rate-limit') {
    return json(
      response,
      429,
      { error: `${service} demo rate limit reached.` },
      { 'retry-after': '2', 'x-ratelimit-remaining': '0' },
    );
  }
  if (scenario === 'unavailable') {
    return json(response, 503, { error: `${service} demo service unavailable.` });
  }
  if (scenario === 'malformed') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    return response.end('{"demo":"malformed"');
  }
  return false;
}

export async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function record(method, pathname, status, service) {
  requests.unshift({ at: new Date().toISOString(), method, pathname, status, service });
  if (requests.length > 200) requests.length = 200;
}
