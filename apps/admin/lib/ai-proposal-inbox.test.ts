import { describe, expect, it } from 'vitest';

import { aiProposalInboxQuerySchema, parseAiProposalInboxQuery } from './ai-proposal-inbox';

describe('AI proposal inbox query parsing', () => {
  it('normalizes pagination, sorting, and filters', () => {
    expect(
      parseAiProposalInboxQuery({
        page: '3',
        pageSize: '50',
        sort: 'confidence',
        proposalType: 'product_content',
        entityType: 'products',
        expiry: 'expired',
        evidence: 'missing',
      }),
    ).toEqual(
      expect.objectContaining({
        page: 3,
        pageSize: 50,
        sort: 'confidence',
        proposalType: 'product_content',
        entityType: 'products',
        expiry: 'expired',
        evidence: 'missing',
      }),
    );
  });

  it('uses safe defaults for malformed query values', () => {
    expect(parseAiProposalInboxQuery({ page: '-2', pageSize: '500', sort: 'unknown' })).toEqual(
      expect.objectContaining({ page: 1, pageSize: 20, sort: 'newest' }),
    );
  });

  it('normalizes absent filters and remains safe to parse again', () => {
    const query = parseAiProposalInboxQuery({});

    expect(query).toMatchObject({
      page: 1,
      pageSize: 20,
      q: null,
      proposalType: null,
      entityType: null,
      model: null,
    });
    expect(aiProposalInboxQuerySchema.parse(query)).toEqual(query);
  });

  it('normalizes blank filters while preserving meaningful values', () => {
    expect(
      parseAiProposalInboxQuery({ q: '  ', proposalType: ' price_update ', model: ['gpt-5'] }),
    ).toMatchObject({
      q: null,
      proposalType: 'price_update',
      model: 'gpt-5',
    });
  });
});
