import { createServer } from 'node:http';
import { handleEcotrack } from './mock-ecotrack.mjs';
import { handleGoogle } from './mock-google.mjs';
import {
  failDeterministically,
  json,
  readJson,
  record,
  requestedFailure,
  serviceForPath,
} from './mock-http.mjs';
import { handleMeta } from './mock-meta.mjs';
import { requests, shipments } from './mock-state.mjs';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const service = serviceForPath(url.pathname);
  try {
    if (url.pathname === '/health')
      return json(response, 200, {
        ok: true,
        services: ['ecotrack-delivro', 'ecotrack-emir', 'meta', 'google', 'tiktok'],
        failureScenarios: ['rate-limit', 'unavailable', 'malformed'],
      });
    if (url.pathname === '/__demo/scenarios')
      return json(response, 200, {
        header: 'x-demo-failure',
        queryParameter: '__demo_failure',
        scenarios: ['rate-limit', 'unavailable', 'malformed'],
      });
    if (url.pathname === '/__demo/requests') return json(response, 200, { requests });
    if (url.pathname === '/__demo/state')
      return json(response, 200, {
        shipments: Array.from(shipments.values()).slice(0, 2000),
        shipmentCount: shipments.size,
        requestCount: requests.length,
      });
    if (url.pathname === '/__demo/reset' && request.method === 'POST') {
      shipments.clear();
      requests.length = 0;
      return json(response, 200, { ok: true });
    }
    if (url.pathname === '/__demo/shipments' && request.method === 'POST') {
      const body = await readJson(request);
      if (!Array.isArray(body.shipments) || body.shipments.length > 2000) {
        return json(response, 400, { error: 'Expected at most 2,000 demo shipments.' });
      }
      for (const input of body.shipments) {
        const tracking = typeof input?.tracking === 'string' ? input.tracking.trim() : '';
        if (!tracking)
          return json(response, 400, { error: 'Every shipment needs a tracking number.' });
        shipments.set(tracking, {
          tracking,
          reference: String(input.reference ?? tracking.replace(/\D/g, '').slice(-5) ?? '1'),
          status: String(input.status ?? 'en_preparation'),
          amount: Number(input.amount ?? 0),
          provider: input.provider === 'emir' ? 'emir' : 'delivro',
          createdAt: String(input.createdAt ?? new Date().toISOString()),
          input:
            input.input && typeof input.input === 'object' && !Array.isArray(input.input)
              ? input.input
              : {},
          updates: Array.isArray(input.updates) ? input.updates : [],
        });
      }
      return json(response, 200, { ok: true, imported: body.shipments.length });
    }
    const failure = requestedFailure(request, url);
    if (failure && failDeterministically(response, failure, service) !== false) return;
    if (url.pathname.startsWith('/ecotrack/')) {
      return await handleEcotrack(request, response, url);
    }
    if (url.pathname.startsWith('/meta/') || /^\/v\d+[.]\d+\//.test(url.pathname)) {
      return await handleMeta(request, response, url);
    }
    if (url.pathname.startsWith('/google/')) {
      return await handleGoogle(request, response, url);
    }
    if (url.pathname.startsWith('/tiktok/')) {
      await readJson(request);
      return json(response, 200, { code: 0, message: 'OK', request_id: 'demo-tiktok-request' });
    }
    return json(response, 404, { error: 'Unknown demo provider route.' });
  } catch (error) {
    return json(response, 500, {
      error: error instanceof Error ? error.message : 'Mock failure.',
    });
  } finally {
    if (!url.pathname.startsWith('/__demo/') && url.pathname !== '/health')
      record(request.method ?? 'GET', url.pathname, response.statusCode, service);
  }
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Bricomaitre demo provider simulator listening on ${port}.\n`);
});
