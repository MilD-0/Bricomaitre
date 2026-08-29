import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  cancelExact: vi.fn(),
  denied: vi.fn(),
  permissions: ['products_write'] as string[],
}));

vi.mock('../../../../../lib/background-jobs', () => ({
  ADMIN_AI_CONTENT_QUEUE: 'admin-ai-content',
  ADMIN_AI_CATEGORIZATION_QUEUE: 'admin-ai-categorization',
  cancelExportJob: mocks.cancel,
}));
vi.mock('../../../../../lib/ai-background-jobs', () => ({
  ADMIN_BACKGROUND_JOB_TYPES: ['ai_categorization', 'ai_content', 'reporting_refresh'],
  allowedAdminBackgroundJobTypes: (permissions: string[]) => [
    ...(permissions.includes('products_write') ? ['ai_categorization', 'ai_content'] : []),
    ...(permissions.includes('analytics_manage') ? ['reporting_refresh'] : []),
  ],
  cancelAdminBackgroundJob: mocks.cancelExact,
}));
vi.mock('../../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'admin@example.com', permissions: mocks.permissions } }),
}));
vi.mock('../../../../../lib/rbac', () => ({ requireAppAccess: mocks.denied }));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/jobs/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/jobs/cancel', () => {
  beforeEach(() => {
    mocks.denied.mockReset().mockResolvedValue(null);
    mocks.cancel.mockReset().mockResolvedValue({ id: 'job-1', status: 'cancelled' });
    mocks.cancelExact
      .mockReset()
      .mockResolvedValue({ job: { id: 'job-2', status: 'running', cancelRequested: true } });
    mocks.permissions = ['products_write'];
  });

  it('cancels the catalog categorization queue for the signed-in owner', async () => {
    const response = await POST(request({ kind: 'categorization' }));
    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith('admin-ai-categorization', 'admin@example.com');
  });

  it('rejects unknown job kinds', async () => {
    const response = await POST(request({ kind: 'unknown' }));
    expect(response.status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('cancels an exact server job for an operator with its domain permission', async () => {
    const jobId = '3c2e0103-ce88-4b4b-b185-f46ed298fe27';

    const response = await POST(request({ type: 'ai_categorization', jobId }));

    expect(response.status).toBe(200);
    expect(mocks.cancelExact).toHaveBeenCalledWith('ai_categorization', jobId);
  });

  it('forbids exact cancellation outside the operator domain', async () => {
    mocks.permissions = ['settings_manage'];
    const response = await POST(
      request({
        type: 'ai_categorization',
        jobId: '3c2e0103-ce88-4b4b-b185-f46ed298fe27',
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.cancelExact).not.toHaveBeenCalled();
  });
});
