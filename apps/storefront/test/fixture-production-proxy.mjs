import { createServer, request as requestWithErrorHandling } from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';

const GZIP_CONTENT_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/xml',
  'application/xml+rss',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/plain',
  'text/x-component',
  'text/xml',
]);

function acceptsGzip(request) {
  return /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(request.headers['accept-encoding'] ?? '');
}

function shouldCompress(request, response) {
  if (request.method === 'HEAD' || !acceptsGzip(request) || response.headers['content-encoding']) {
    return false;
  }
  const contentType = String(response.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const contentLength = Number(response.headers['content-length']);
  return (
    GZIP_CONTENT_TYPES.has(contentType) &&
    (!Number.isFinite(contentLength) || contentLength >= 1_024)
  );
}

export function createProductionCompressionProxy({ upstreamPort = 3004 } = {}) {
  return createServer((request, response) => {
    const upstreamRequest = requestWithErrorHandling(
      {
        hostname: '127.0.0.1',
        port: upstreamPort,
        method: request.method,
        path: request.url,
        headers: {
          ...request.headers,
          'accept-encoding': 'identity',
          connection: 'close',
        },
      },
      (upstreamResponse) => {
        const headers = { ...upstreamResponse.headers };
        delete headers.connection;
        delete headers['transfer-encoding'];

        if (shouldCompress(request, upstreamResponse)) {
          delete headers['content-length'];
          headers['content-encoding'] = 'gzip';
          headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding';
          response.writeHead(upstreamResponse.statusCode ?? 502, headers);
          upstreamResponse.pipe(createGzip({ level: 5 })).pipe(response);
        } else {
          response.writeHead(upstreamResponse.statusCode ?? 502, headers);
          upstreamResponse.pipe(response);
        }
      },
    );

    upstreamRequest.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      response.end('production compression proxy could not reach Next');
    });
    request.pipe(upstreamRequest);
  });
}

function main() {
  const port = Number(process.env.PORT ?? 3003);
  const upstreamPort = Number(process.env.UPSTREAM_PORT ?? 3004);
  if (!Number.isSafeInteger(port) || port < 1 || !Number.isSafeInteger(upstreamPort)) {
    throw new Error('PORT and UPSTREAM_PORT must be positive integers.');
  }

  const server = createProductionCompressionProxy({ upstreamPort });
  server.listen(port, '127.0.0.1', () => {
    console.info(`Production compression proxy listening on http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
