import { createServer, get } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import { createProductionCompressionProxy } from './fixture-production-proxy.mjs';

const servers: Array<ReturnType<typeof createServer>> = [];

function listen(server: ReturnType<typeof createServer>) {
  servers.push(server);
  return new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind TCP');
      resolve(address.port);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('production compression proxy fixture', () => {
  it.each(['text/html', 'text/x-component'])(
    'reproduces Nginx gzip behavior for %s responses',
    async (contentType) => {
      const body = '<main>compressed production response</main>'.repeat(100);
      const upstreamPort = await listen(
        createServer((_request, response) => {
          response.writeHead(200, {
            'content-type': `${contentType}; charset=utf-8`,
            'content-length': Buffer.byteLength(body),
          });
          response.end(body);
        }),
      );
      const proxyPort = await listen(createProductionCompressionProxy({ upstreamPort }));

      const result = await new Promise<{ headers: Record<string, unknown>; body: Buffer }>(
        (resolve, reject) => {
          get(
            {
              hostname: '127.0.0.1',
              port: proxyPort,
              path: '/',
              headers: { 'accept-encoding': 'gzip' },
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
              response.on('end', () =>
                resolve({ headers: response.headers, body: Buffer.concat(chunks) }),
              );
            },
          ).on('error', reject);
        },
      );

      expect(result.headers['content-encoding']).toBe('gzip');
      expect(gunzipSync(result.body).toString()).toBe(body);
    },
  );
});
