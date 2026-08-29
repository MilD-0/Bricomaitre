import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAiLandingPageJob, type AiLandingPagePayload } from './background-jobs';

const actor = { email: 'admin@example.com', name: 'Admin' };

function payload(work: AiLandingPagePayload['work']): AiLandingPagePayload {
  return {
    __jobMeta: {
      id: 'landing-job',
      ownerKey: 'admin@example.com',
      queueName: 'admin-ai-landing-page',
      activeScope: 'owner',
    },
    conversationId: 42,
    actor,
    work,
  };
}

function helpers() {
  return {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateSummary: vi.fn().mockResolvedValue(undefined),
    throwIfCancelled: vi.fn().mockResolvedValue(undefined),
  };
}

function landingResult(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    id: 41,
    productId: 12,
    locale: 'fr' as const,
    slug: 'perceuse-41',
    active: false,
    currentRevision: 1,
    generation: {
      model: 'openai/gpt-5.6-luna',
      reasoning: 'A direct campaign.',
      groundingNotes: ['Catalog facts used.'],
      stages: {
        status: 'completed',
        plannedSections: 3,
        generatedSections: 3,
        failures: [],
      },
    },
    ...overrides,
  };
}

describe('landing-page background worker', () => {
  const dependencies = {
    create: vi.fn(),
    revise: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('creates and optionally publishes only after successful generation', async () => {
    dependencies.create.mockResolvedValue(landingResult({ active: true }));
    const jobHelpers = helpers();

    await expect(
      runAiLandingPageJob(
        payload({
          operation: 'create',
          productId: 12,
          locale: 'fr',
          creativeBrief: 'For mobile mechanics',
          publish: true,
        }),
        jobHelpers,
        dependencies,
      ),
    ).resolves.toMatchObject({
      operation: 'create',
      complete: true,
      partial: false,
      landingPageId: 41,
      active: true,
    });
    expect(dependencies.create).toHaveBeenCalledWith(
      {
        productId: 12,
        locale: 'fr',
        creativeBrief: 'For mobile mechanics',
        active: true,
      },
      actor,
    );
    expect(jobHelpers.updateSummary).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true, landingPageId: 41 }),
    );
  });

  it('preserves active publication on revision and exposes partial generation', async () => {
    dependencies.revise.mockResolvedValue(
      landingResult({
        currentRevision: 4,
        active: true,
        generation: {
          ...landingResult().generation,
          stages: {
            status: 'partial-fallback',
            generatedSections: 1,
            failures: [{ blockId: 'hero', reason: 'provider-error' }],
          },
        },
      }),
    );

    const result = await runAiLandingPageJob(
      payload({
        operation: 'revise',
        landingPageId: 41,
        expectedRevision: 3,
        instruction: 'Rewrite the hero.',
        targetBlockIds: ['hero'],
        deleteBlockIds: [],
        allowStructuralChanges: false,
        publication: 'preserve',
      }),
      helpers(),
      dependencies,
    );

    expect(dependencies.revise).toHaveBeenCalledWith(
      expect.objectContaining({ active: null, targetBlockIds: ['hero'] }),
      actor,
    );
    expect(result).toMatchObject({
      operation: 'revise',
      complete: false,
      partial: true,
      currentRevision: 4,
      active: true,
    });
  });

  it('honors cancellation before invoking content generation', async () => {
    const jobHelpers = helpers();
    jobHelpers.throwIfCancelled.mockRejectedValue(new Error('cancelled'));

    await expect(
      runAiLandingPageJob(
        payload({ operation: 'create', productId: 12, locale: 'fr', publish: false }),
        jobHelpers,
        dependencies,
      ),
    ).rejects.toThrow('cancelled');
    expect(dependencies.create).not.toHaveBeenCalled();
  });
});
