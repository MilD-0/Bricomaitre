import { describe, expect, it } from 'vitest';

import { CURRENT_AI_PROPOSAL_TYPES } from './ai-proposal-inbox';

describe('AI proposal inbox scope', () => {
  it('contains only proposal types with live creation paths', () => {
    expect(CURRENT_AI_PROPOSAL_TYPES).toEqual([
      'product_content',
      'product_relation',
      'product_category',
    ]);
  });
});
