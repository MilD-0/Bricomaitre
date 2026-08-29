import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  latest: vi.fn(),
}));

vi.mock('./background-jobs', () => ({
  ADMIN_AI_LANDING_PAGE_QUEUE: 'admin-ai-landing-page',
  startAiLandingPageJob: mocks.start,
  getLatestExportJob: mocks.latest,
}));

import {
  getAdminAiLandingPageJobStatus,
  startAdminAiLandingPageWork,
} from './admin-ai-landing-page-jobs';

const context = {
  ownerKey: 'admin@example.com',
  actor: { email: 'admin@example.com', name: 'Admin' },
  conversationId: 42,
};

describe('admin AI landing-page jobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts exact creation and preserves draft publication by default', async () => {
    mocks.start.mockResolvedValue({
      kind: 'started',
      job: { id: 'landing-job', status: 'queued' },
    });

    await expect(
      startAdminAiLandingPageWork({ operation: 'create', productId: 12, locale: 'fr' }, context),
    ).resolves.toMatchObject({
      kind: 'landing_page_job_started',
      ok: true,
      operation: 'create',
    });
    expect(mocks.start).toHaveBeenCalledWith('admin@example.com', {
      work: {
        operation: 'create',
        productId: 12,
        locale: 'fr',
        publish: false,
      },
      actor: context.actor,
      conversationId: 42,
    });
  });

  it('starts an exact scoped revision and reports a truthful busy receipt', async () => {
    mocks.start.mockResolvedValue({
      kind: 'busy',
      job: { id: 'existing-job', status: 'running' },
    });

    await expect(
      startAdminAiLandingPageWork(
        {
          operation: 'revise',
          landingPageId: 41,
          expectedRevision: 3,
          instruction: 'Rewrite only the hero.',
          targetBlockIds: ['hero'],
        },
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'landing_page_job_busy',
      ok: false,
      startDisposition: 'busy',
    });
    expect(mocks.start).toHaveBeenCalledWith(
      'admin@example.com',
      expect.objectContaining({
        work: expect.objectContaining({
          targetBlockIds: ['hero'],
          deleteBlockIds: [],
          allowStructuralChanges: false,
          publication: 'preserve',
        }),
      }),
    );
  });

  it('reads the latest owner-scoped landing-page job', async () => {
    mocks.latest.mockResolvedValue({ id: 'landing-job', status: 'completed' });

    await expect(getAdminAiLandingPageJobStatus('admin@example.com')).resolves.toMatchObject({
      kind: 'landing_page_job_status',
      job: { status: 'completed' },
    });
    expect(mocks.latest).toHaveBeenCalledWith('admin-ai-landing-page', 'admin@example.com');
  });
});
