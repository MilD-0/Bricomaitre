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
    ['update_order_details', 'updatedCount'],
    ['delete_orders', 'deletedCount'],
    ['manage_analytics_costs', 'changedCount'],
    ['manage_analytics_day_overrides', 'changedCount'],
    ['manage_off_pipeline_sales', 'changedCount'],
    ['manage_ecotrack_shipments', 'successCount'],
    ['change_ecotrack_shipments', 'successCount'],
  ]) {
    expect(adminAiToolConfirmsCompletedMutation(tool!, { ok: false, [key!]: 1 })).toBe(true);
    expect(adminAiToolConfirmsCompletedMutation(tool!, { ok: false, [key!]: 0 })).toBe(false);
  }
});

it('recognizes saved status and tracking effects without treating missing rows as changes', () => {
  for (const items of [[], [{ orderId: 1, status: 1 }]]) {
    expect(
      adminAiToolConfirmsCompletedMutation('update_order_status', {
        ok: false,
        items,
        skipped: [{ orderId: 2, reason: 'missing' }],
        failed: [],
      }),
    ).toBe(items.length > 0);
  }
  for (const action of ['existing', 'issued']) {
    expect(
      adminAiToolConfirmsCompletedMutation('get_order_tracking_links', {
        ok: false,
        items: [{ orderId: 1, action }],
        failed: [{ orderId: 2 }],
      }),
    ).toBe(action === 'issued');
  }
});

it('recognizes canonical analytics settings and synchronization receipts', () => {
  expect(
    adminAiToolConfirmsCompletedMutation('update_analytics_settings', {
      kind: 'analytics_settings',
      previous: { planningReturnRate: 10 },
      current: { planningReturnRate: 20 },
      changedFields: ['planningReturnRate'],
    }),
  ).toBe(true);
  expect(
    adminAiToolConfirmsCompletedMutation('sync_analytics_source', {
      kind: 'analytics_sync',
      source: 'searchConsole',
      result: { totals: 3 },
    }),
  ).toBe(true);
  for (const tool of [
    'update_analytics_settings',
    'sync_analytics_source',
    'manage_analytics_costs',
  ]) {
    expect(
      adminAiToolConfirmsCompletedMutation(tool, {
        kind: 'evaluation_noop',
        applied: false,
      }),
    ).toBe(false);
  }
});
