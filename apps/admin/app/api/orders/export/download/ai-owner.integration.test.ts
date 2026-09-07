import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'operator-user-id',
  email: 'operator@example.invalid',
  jobs: new Map<string, unknown>(),
}));
vi.mock('../../../../../lib/auth', () => ({
  auth: async () => ({
    user: { id: state.userId, email: state.email, isAllowed: true, permissions: ['orders_write'] },
  }),
}));
vi.mock('../../../../../lib/admin-orders-data', async (original) => ({
  ...(await original<typeof import('../../../../../lib/admin-orders-data')>()),
  loadOrderRecordsByIds: async () => [{ id: 9 }],
}));
vi.mock('../../../../../lib/background-jobs', async (original) => ({
  ...(await original<typeof import('../../../../../lib/background-jobs')>()),
  startOrderExportJob: async (ownerKey: string) => {
    const job = {
      id: 'ai-export',
      status: 'completed',
      fileName: 'orders.xlsx',
      resultSummary: {
        artifactKey: 'exports/orders/ai.xlsx',
        artifactExpiresAt: '2099-01-01T00:00:00Z',
      },
    };
    state.jobs.set(ownerKey, job);
    return { kind: 'started', job };
  },
  getLatestExportJob: async (_queue: string, ownerKey: string) => state.jobs.get(ownerKey),
}));
vi.mock('../../../../../lib/s3-upload', async (original) => ({
  ...(await original<typeof import('../../../../../lib/s3-upload')>()),
  readPrivateS3Object: async () => ({
    Body: {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('spreadsheet artifact'));
            controller.close();
          },
        }),
    },
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
}));
import { buildAdminAiTools } from '../../../../../lib/admin-ai-tools';
import { GET } from './route';

it('downloads an AI-created export for the same authenticated user even after their email changes, and denies another user', async () => {
  const tools = buildAdminAiTools({
    permissions: ['orders_write'],
    locale: 'en',
    runtime: {
      kind: 'live',
      actorId: state.email,
      exportOwnerKey: state.userId,
      actor: { email: state.email },
      conversationId: 7,
      autoAcceptProposals: false,
    },
  }) as unknown as Record<string, { execute(input: unknown): Promise<unknown> }>;
  await tools.start_order_export!.execute({ mode: 'selected', orderIds: [9] });
  expect(state.jobs.has(state.userId)).toBe(true);
  expect(state.jobs.has(state.email)).toBe(false);
  state.email = 'renamed@example.invalid';
  const response = await GET(
    new NextRequest('http://localhost/api/orders/export/download?jobId=ai-export'),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('spreadsheet artifact');
  state.userId = 'different-user';
  expect(
    (await GET(new NextRequest('http://localhost/api/orders/export/download?jobId=ai-export')))
      .status,
  ).toBe(404);
});
