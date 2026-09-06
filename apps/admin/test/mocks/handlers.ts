import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () => HttpResponse.json({ ok: true })),
  http.get('/api/orders/ecotrack/recovery', () => HttpResponse.json({ items: [] })),
];
