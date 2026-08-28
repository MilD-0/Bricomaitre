import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_EXECUTION_CAPABILITIES,
  ADMIN_AI_EXECUTION_TOOL_NAMES,
  ADMIN_AI_MUTATING_TOOL_NAMES,
  adminAiCapabilityEvidenceForModel,
  adminAiReadCapabilityEvidenceForModel,
  adminAiReadableToolNames,
  adminAiToolMutatesApplication,
} from './admin-ai-execution-capabilities';
import { ADMIN_AI_PRESENTED_TOOL_NAMES } from './admin-ai-tool-presentation';

describe('admin AI execution capability evidence', () => {
  it('accounts for every executable assistant tool exactly once', () => {
    expect(new Set(ADMIN_AI_EXECUTION_TOOL_NAMES).size).toBe(ADMIN_AI_EXECUTION_TOOL_NAMES.length);
    expect([...ADMIN_AI_EXECUTION_TOOL_NAMES].sort()).toEqual(
      [
        ...ADMIN_AI_PRESENTED_TOOL_NAMES.filter((name) => name !== 'ecotrack_posting_terminal'),
        'query_analytics',
        'query_ai_stats',
      ].sort(),
    );
  });

  it('keeps read-only exposure permission-aware without using operator wording', () => {
    expect(
      adminAiReadableToolNames({ permissions: ['orders_write'], backgroundJobsAvailable: true }),
    ).toEqual(
      expect.arrayContaining([
        'find_products',
        'query_orders',
        'inspect_orders',
        'preview_order_export',
        'inspect_order_shopping_list',
        'preview_ecotrack_posting',
        'inspect_ecotrack_shipments',
        'list_background_jobs',
        'get_background_job',
      ]),
    );
    expect(
      adminAiReadableToolNames({ permissions: ['orders_write'], backgroundJobsAvailable: true }),
    ).not.toEqual(
      expect.arrayContaining(['inspect_inventory', 'query_analytics', 'delete_orders']),
    );
  });

  it('distinguishes execution consequences from reads, previews, and monitoring', () => {
    for (const toolName of ADMIN_AI_MUTATING_TOOL_NAMES) {
      expect(adminAiToolMutatesApplication(toolName), toolName).toBe(true);
    }
    for (const capability of ADMIN_AI_EXECUTION_CAPABILITIES) {
      if (['read', 'preview', 'monitor'].includes(capability.effect)) {
        expect(adminAiToolMutatesApplication(capability.toolName), capability.toolName).toBe(false);
        expect(capability.risk, capability.toolName).toBe('none');
      }
    }
  });

  it('summarizes permitted capability domains for model reasoning', () => {
    const evidence = adminAiCapabilityEvidenceForModel(
      ['products_write', 'analytics_manage'],
      true,
    );

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'products', effects: expect.arrayContaining(['read']) }),
        expect.objectContaining({ domain: 'inventory', effects: expect.arrayContaining(['read']) }),
        expect.objectContaining({ domain: 'analytics', effects: expect.arrayContaining(['read']) }),
        expect.objectContaining({ domain: 'backgroundWork' }),
      ]),
    );
    expect(evidence.map((item) => item.domain)).not.toContain('administration');
  });

  it('gives the reasoning model permission-aware evidence scopes instead of bare tool names', () => {
    const evidence = adminAiReadCapabilityEvidenceForModel({
      permissions: ['orders_write', 'analytics_manage'],
      backgroundJobsAvailable: false,
    });

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: 'query_orders',
          purpose: expect.stringContaining('current in-house state'),
        }),
        expect.objectContaining({
          toolName: 'inspect_orders',
          purpose: expect.stringContaining('does not calculate Analytics metrics'),
        }),
        expect.objectContaining({
          toolName: 'query_analytics',
          purpose: expect.stringContaining('exact eligible orders missing canonical EcoTrack'),
        }),
        expect.objectContaining({
          toolName: 'query_ai_stats',
          purpose: expect.stringContaining('AI Operations and Shopping Assistant'),
        }),
      ]),
    );
    expect(evidence.map((item) => item.toolName)).not.toContain('inspect_administration');
    expect(evidence.every((item) => item.purpose.length > 20)).toBe(true);
  });
});
