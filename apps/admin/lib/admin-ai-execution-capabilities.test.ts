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

it('preserves evidence of committed batch effects despite sibling failures', () => {
  expect(
    adminAiToolConfirmsCompletedMutation('adjust_inventory', {
      ok: false,
      items: [{ productId: 1, previousQuantity: 10, nextQuantity: 8 }],
      skipped: [{ productId: 2 }],
    }),
  ).toBe(true);
  expect(
    adminAiToolConfirmsCompletedMutation('adjust_inventory', {
      ok: false,
      items: [],
      skipped: [{ productId: 2 }],
    }),
  ).toBe(false);
  expect(
    adminAiToolConfirmsCompletedMutation('receive_inventory', {
      ok: true,
      complete: false,
      items: [],
      skipped: [{ productId: 2 }],
    }),
  ).toBe(false);
  for (const [tool, key] of [
    ['update_inventory_state', 'updatedCount'],
    ['update_products', 'updatedCount'],
    ['archive_products', 'archivedCount'],
    ['restore_products', 'restoredCount'],
    ['generate_product_content', 'appliedCount'],
  ]) {
    expect(adminAiToolConfirmsCompletedMutation(tool!, { ok: false, [key!]: 1 })).toBe(true);
    expect(adminAiToolConfirmsCompletedMutation(tool!, { ok: false, [key!]: 0 })).toBe(false);
  }
});
