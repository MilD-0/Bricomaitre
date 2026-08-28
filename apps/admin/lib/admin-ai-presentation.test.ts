import { describe, expect, it } from 'vitest';

import {
  adminAiEvidenceToolResults,
  adminAiPresentationFromToolResults,
  adminAiPresentationToolResult,
  adminAiPresentationValueAtPath,
} from './admin-ai-presentation';

const toolResults = [
  {
    type: 'tool-result',
    toolName: 'query_analytics',
    output: { metrics: [{ key: 'trueProfit', value: 120 }], nested: { rows: [{ id: 4 }] } },
  },
  {
    type: 'tool-result',
    toolName: 'query_analytics',
    output: { metrics: [{ key: 'adCost', value: 30 }] },
  },
  {
    type: 'tool-result',
    toolName: 'present_admin_ui',
    output: {
      kind: 'admin_ui_blocks_v1',
      blocks: [
        {
          kind: 'records',
          toolName: 'query_analytics',
          occurrence: 0,
          path: 'nested.rows',
          columns: ['id'],
          limit: 5,
        },
      ],
    },
  },
];

describe('admin AI presentation plan', () => {
  it('keeps presentation instructions separate from trusted evidence', () => {
    expect(adminAiEvidenceToolResults(toolResults).map((result) => result.toolName)).toEqual([
      'query_analytics',
      'query_analytics',
    ]);
    expect(adminAiPresentationFromToolResults(toolResults)).toMatchObject({
      kind: 'admin_ui_blocks_v1',
      blocks: [{ kind: 'records', path: 'nested.rows', columns: ['id'] }],
    });
  });

  it('resolves only an exact referenced result occurrence and path', () => {
    const evidence = adminAiEvidenceToolResults(toolResults);
    expect(
      adminAiPresentationToolResult(evidence, { toolName: 'query_analytics', occurrence: 1 })
        ?.output,
    ).toMatchObject({ metrics: [{ key: 'adCost' }] });
    expect(adminAiPresentationValueAtPath(evidence[0].output, 'nested.rows[0].id')).toBe(4);
    expect(adminAiPresentationValueAtPath(evidence[0].output, 'nested.missing')).toBeUndefined();
  });

  it('ignores malformed or invented presentation plans', () => {
    expect(
      adminAiPresentationFromToolResults([
        {
          type: 'tool-result',
          toolName: 'present_admin_ui',
          output: {
            kind: 'admin_ui_blocks_v1',
            blocks: [{ kind: 'records', toolName: 'inspect_orders', path: '../items' }],
          },
        },
      ]),
    ).toBeNull();
  });
});
