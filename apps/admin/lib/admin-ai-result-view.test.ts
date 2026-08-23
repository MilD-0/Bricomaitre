import { describe, expect, it } from 'vitest';

import {
  adminAiMetricsFromUnknown,
  adminAiResultTables,
  adminAiScalarEntries,
  adminAiToolResultsFromUnknown,
} from './admin-ai-result-view';

describe('admin assistant result presentation', () => {
  it('extracts named tool results without treating nested output data as another result', () => {
    const input = [
      {
        type: 'tool-result',
        toolName: 'find_products',
        output: { items: [{ type: 'tool-result', toolName: 'untrusted', output: {} }] },
      },
    ];

    expect(adminAiToolResultsFromUnknown(input)).toEqual([
      { toolName: 'find_products', output: input[0].output },
    ]);
  });

  it('prepares nested scalar summaries and bounded record tables', () => {
    const output = {
      total: 25,
      filters: { status: 'low_stock' },
      items: Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        sku: `SKU-${index + 1}`,
        quantity: index,
        nested: { ignored: true },
      })),
    };

    expect(adminAiScalarEntries(output)).toEqual([
      ['total', 25],
      ['filters.status', 'low_stock'],
    ]);
    expect(adminAiResultTables(output)).toMatchObject([
      {
        path: 'items',
        available: 12,
        columns: ['id', 'sku', 'quantity'],
      },
    ]);
    expect(adminAiResultTables(output)[0]?.rows).toHaveLength(10);
    expect(adminAiResultTables([{ id: 1, status: 'ready' }])).toMatchObject([
      { path: 'results', rows: [{ id: 1, status: 'ready' }] },
    ]);
  });

  it('extracts canonical Analytics2 metrics from nested payloads', () => {
    expect(
      adminAiMetricsFromUnknown({
        kind: 'catalog',
        metrics: [{ key: 'paidUnits', value: 120, previous: 100, changePct: 20, unit: 'number' }],
      }),
    ).toEqual([{ key: 'paidUnits', value: 120, previous: 100, changePct: 20, unit: 'number' }]);
  });
});
