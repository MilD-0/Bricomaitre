import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const smokeScript = resolve(workspaceRoot, 'ops/scripts/smoke-check.sh');
const servers: ReturnType<typeof createServer>[] = [];

async function runSmoke({
  storefrontApp = 'storefront',
  duplicateRequestIdHost,
  transientDuplicateRequestIdHost,
}: {
  storefrontApp?: string;
  duplicateRequestIdHost?: string;
  transientDuplicateRequestIdHost?: string;
} = {}) {
  const requestedHosts: string[] = [];
  const healthRequestsByHost = new Map<string, number>();
  const server = createServer((request, response) => {
    const host = request.headers.host;
    const path = request.url ?? '/';
    if (host) requestedHosts.push(host);

    const healthRequestCount =
      path === '/api/health' && host ? (healthRequestsByHost.get(host) ?? 0) + 1 : 0;
    if (host && healthRequestCount > 0) {
      healthRequestsByHost.set(host, healthRequestCount);
    }

    const hasDuplicateRequestId =
      host === duplicateRequestIdHost ||
      (host === transientDuplicateRequestIdHost && healthRequestCount <= 2);

    response.statusCode = 200;
    response.setHeader(
      'x-request-id',
      hasDuplicateRequestId ? ['request-one', 'request-two'] : 'request-one',
    );
    if (path === '/api/health') {
      const app =
        host === 'admin.test' ? 'admin' : host === 'api.test' ? 'storefront-api' : storefrontApp;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', app }));
      return;
    }
    if (path === '/robots.txt') {
      response.end('Sitemap: https://store.test/sitemap.xml\n');
      return;
    }
    if (path === '/sitemap.xml') {
      response.end(
        '<urlset><url><loc>https://store.test/fr/products/outil-test</loc></url></urlset>',
      );
      return;
    }
    if (path === '/fr' || path === '/ar') {
      response.end('<html><title>Bricomaitre</title></html>');
      return;
    }
    if (path === '/fr/products' || path === '/fr/checkout') {
      response.end('<html>ok</html>');
      return;
    }

    response.statusCode = 404;
    response.end('missing');
  });
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');

  return await new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
    requestedHosts: string[];
  }>((resolveRun) => {
    const child = spawn('bash', [smokeScript], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BRIC_PROXY_URL: `http://127.0.0.1:${address.port}`,
        BRIC_ADMIN_DOMAIN: 'admin.test',
        BRIC_API_DOMAIN: 'api.test',
        BRIC_STOREFRONT_DOMAIN: 'store.test',
        BRIC_SMOKE_REQUEST_ID_ATTEMPTS: '3',
        BRIC_SMOKE_RETRY_DELAY_SECONDS: '0',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (status) =>
      resolveRun({ status, stdout, stderr, requestedHosts: [...requestedHosts] }),
    );
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose) => {
          server.close(() => resolveClose());
        }),
    ),
  );
});

describe('production storefront smoke contract', () => {
  it('accepts the complete storefront release surface', async () => {
    const result = await runSmoke();

    expect(result).toMatchObject({ status: 0 });
    expect(result.stdout).toContain('smoke checks passed');
    expect(new Set(result.requestedHosts)).toEqual(
      new Set(['admin.test', 'api.test', 'store.test']),
    );
  });

  it('rejects a healthy app with the wrong storefront identity', async () => {
    const result = await runSmoke({ storefrontApp: 'unexpected-app' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('storefront health did not identify storefront');
  });

  it('rejects duplicate edge request identifiers', async () => {
    const result = await runSmoke({ duplicateRequestIdHost: 'api.test' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'api.test /api/health returned 2 x-request-id headers after 3 attempts',
    );
  });

  it('tolerates the retiring Nginx worker generation immediately after reload', async () => {
    const result = await runSmoke({ transientDuplicateRequestIdHost: 'admin.test' });

    expect(result).toMatchObject({ status: 0 });
    expect(result.stdout).toContain('smoke checks passed');
    expect(result.requestedHosts.filter((host) => host === 'admin.test').length).toBeGreaterThan(2);
  });
});
