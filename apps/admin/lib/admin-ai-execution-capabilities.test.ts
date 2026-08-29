import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_MUTATING_TOOL_NAMES,
  adminAiToolConfirmsCompletedMutation,
  adminAiToolMutatesApplication,
} from './admin-ai-execution-capabilities';

describe('admin AI mutation evidence', () => {
  it('keeps one small unique set of live mutating tool names', () => {
    expect(new Set(ADMIN_AI_MUTATING_TOOL_NAMES).size).toBe(ADMIN_AI_MUTATING_TOOL_NAMES.length);
    expect(ADMIN_AI_MUTATING_TOOL_NAMES).toContain('set_landing_page_active');
    expect(ADMIN_AI_MUTATING_TOOL_NAMES).not.toContain('inspect_landing_pages');
    expect(ADMIN_AI_MUTATING_TOOL_NAMES).not.toContain('inspect_bulletin');
    expect(ADMIN_AI_MUTATING_TOOL_NAMES).not.toContain('create_landing_page');
  });

  it('distinguishes mutations from reads without maintaining a capability registry', () => {
    for (const toolName of ADMIN_AI_MUTATING_TOOL_NAMES) {
      expect(adminAiToolMutatesApplication(toolName), toolName).toBe(true);
    }
    for (const toolName of [
      'query_products',
      'query_orders',
      'preview_ecotrack_posting',
      'query_analytics',
      'inspect_assets',
      'future_tool',
    ]) {
      expect(adminAiToolMutatesApplication(toolName), toolName).toBe(false);
    }
  });

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
