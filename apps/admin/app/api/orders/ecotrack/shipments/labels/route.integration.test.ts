import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  fetchMergedEcotrackLabelsMock,
  parseEcotrackBulkActionMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  fetchMergedEcotrackLabelsMock: vi.fn(),
  parseEcotrackBulkActionMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../lib/admin-ecotrack-orders-data', () => ({
  parseEcotrackBulkAction: parseEcotrackBulkActionMock,
  fetchMergedEcotrackLabels: fetchMergedEcotrackLabelsMock,
}));

describe('app/api/orders/ecotrack/shipments/labels/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    fetchMergedEcotrackLabelsMock.mockReset();
    parseEcotrackBulkActionMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockResolvedValue(null);
    parseEcotrackBulkActionMock.mockReturnValue({ orderIds: [11, 12] });
  });

  it('returns structured partial label results as JSON', async () => {
    fetchMergedEcotrackLabelsMock.mockResolvedValue({
      ok: true,
      items: [{ orderId: 11, reference: '11', trackingNumber: 'TRK-11' }],
      failures: [
        { orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' },
      ],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
      fileName: 'ecotrack-labels-2026-05-02.pdf',
      pdfBase64: 'JVBERi0xLjcK',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/labels', {
        method: 'POST',
        body: JSON.stringify({ orderIds: [11, 12] }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ orderId: 11, reference: '11', trackingNumber: 'TRK-11' }],
      failures: [
        { orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' },
      ],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
      fileName: 'ecotrack-labels-2026-05-02.pdf',
      pdfBase64: 'JVBERi0xLjcK',
    });
  });

  it('returns validation errors for invalid payloads', async () => {
    parseEcotrackBulkActionMock.mockImplementation(() => {
      throw new Error('Invalid payload');
    });

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/labels', {
        method: 'POST',
        body: JSON.stringify({ orderIds: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid payload' });
  });

  it('returns structured all-failed label results as JSON', async () => {
    fetchMergedEcotrackLabelsMock.mockResolvedValue({
      ok: false,
      items: [],
      failures: [
        { orderId: 11, reference: '11', trackingNumber: 'TRK-11', message: 'Order #11 failed.' },
      ],
      successCount: 0,
      failureCount: 1,
      totalRequested: 1,
      fileName: null,
      pdfBase64: null,
    });

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/labels', {
        method: 'POST',
        body: JSON.stringify({ orderIds: [11] }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      items: [],
      failures: [
        { orderId: 11, reference: '11', trackingNumber: 'TRK-11', message: 'Order #11 failed.' },
      ],
      successCount: 0,
      failureCount: 1,
      totalRequested: 1,
      fileName: null,
      pdfBase64: null,
    });
  });
});
