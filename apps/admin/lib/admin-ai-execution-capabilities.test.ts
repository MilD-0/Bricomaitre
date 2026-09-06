import { describe, expect, it } from 'vitest';

import { adminAiToolConfirmsCompletedMutation } from './admin-ai-execution-capabilities';

describe('admin AI mutation evidence', () => {
  it('does not describe queued or background work as a completed change', () => {
    expect(
      adminAiToolConfirmsCompletedMutation('start_landing_page_work', {
        ok: true,
        job: { status: 'completed' },
      }),
    ).toBe(false);
    expect(
      adminAiToolConfirmsCompletedMutation('post_orders_to_ecotrack', {
        ok: true,
        job: { status: 'queued' },
      }),
    ).toBe(false);
    expect(
      adminAiToolConfirmsCompletedMutation('set_landing_page_active', {
        ok: true,
        changed: true,
      }),
    ).toBe(true);
    expect(adminAiToolConfirmsCompletedMutation('query_products', { ok: true })).toBe(false);
  });
});

it('recognizes verified inline content changes while rejecting queued and pending proposals', () => {
  expect(
    adminAiToolConfirmsCompletedMutation('generate_product_content', { ok: true, appliedCount: 2 }),
  ).toBe(true);
  expect(
    adminAiToolConfirmsCompletedMutation('generate_product_content', {
      ok: true,
      appliedCount: 0,
      pendingReviewCount: 2,
    }),
  ).toBe(false);
  expect(
    adminAiToolConfirmsCompletedMutation('generate_product_content', {
      ok: true,
      job: { status: 'queued' },
    }),
  ).toBe(false);
});
