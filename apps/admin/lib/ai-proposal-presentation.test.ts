import { describe, expect, it } from 'vitest';

import type { AiProposalInboxItem } from './ai-proposal-inbox';
import {
  humanizeProposalToken,
  isExpandableProposalValue,
  proposalFields,
  proposalPreview,
  proposalValueDetails,
  proposalValueSummary,
} from './ai-proposal-presentation';

function proposal(overrides: Partial<AiProposalInboxItem> = {}): AiProposalInboxItem {
  return {
    id: 4,
    proposalType: 'product_content',
    entityType: 'products',
    entityId: 10,
    payload: null,
    reasoning: null,
    evidence: [],
    confidence: null,
    requestedBy: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-08-19T00:00:00.000Z',
    task: 'product_content_proposal',
    model: 'deepseek-v4',
    ...overrides,
  };
}

describe('AI proposal presentation', () => {
  it('extracts exact before and proposed fields from edit payloads', () => {
    expect(
      proposalFields({
        before: { title: 'Old title', active: true },
        changes: { title: 'New title', active: false },
      }),
    ).toEqual([
      { key: 'title', before: 'Old title', after: 'New title', hasBefore: true },
      { key: 'active', before: true, after: false, hasBefore: true },
    ]);
  });

  it('treats creation values as proposed-only fields', () => {
    expect(proposalFields({ values: { name: 'Wadfow', isActive: false } })).toEqual([
      { key: 'name', before: undefined, after: 'Wadfow', hasBefore: false },
      { key: 'isActive', before: undefined, after: false, hasBefore: false },
    ]);
  });

  it('builds concise previews for changes and specialized proposals', () => {
    expect(
      proposalPreview(
        proposal({ payload: { changes: { titleAr: 'عنوان', description: 'Copy', active: true } } }),
      ),
    ).toEqual({ kind: 'fields', fields: ['Title Ar', 'Description'], remaining: 1 });
    expect(
      proposalPreview(
        proposal({
          proposalType: 'featured_products',
          payload: { productIds: [1, 2, 3] },
        }),
      ),
    ).toEqual({ kind: 'products', count: 3 });
    expect(
      proposalPreview(
        proposal({ proposalType: 'landing_page', payload: { locale: 'ar', document: {} } }),
      ),
    ).toEqual({ kind: 'landing', locale: 'AR' });
  });

  it('summarizes structured values without hiding their exact representation', () => {
    expect(proposalValueSummary({ title: 'Drill', active: true })).toBe('2 fields');
    expect(proposalValueSummary([1, 2, 3])).toBe('3 items');
    expect(isExpandableProposalValue({ title: 'Drill' })).toBe(true);
    expect(proposalValueDetails({ title: 'Drill' })).toContain('"title": "Drill"');
  });

  it('humanizes stored identifiers for review copy', () => {
    expect(humanizeProposalToken('product_content')).toBe('Product content');
    expect(humanizeProposalToken('minimumGrossMargin')).toBe('Minimum Gross Margin');
  });
});
