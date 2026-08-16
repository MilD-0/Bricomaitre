import { describe, expect, it } from 'vitest';

import { mergeStorefrontProductSelections } from '@bric/storefront-core/catalog';

describe('homepage featured product selection', () => {
  it('keeps explicit admin products first, de-duplicates dynamic matches, and enforces the section limit', () => {
    const direct = [{ id: 9 }, { id: 3 }];
    const dynamic = [{ id: 3 }, { id: 7 }, { id: 5 }];
    expect(mergeStorefrontProductSelections(direct, dynamic, 4)).toEqual([
      { id: 9 },
      { id: 3 },
      { id: 7 },
      { id: 5 },
    ]);
    expect(mergeStorefrontProductSelections(direct, dynamic, 2)).toEqual([{ id: 9 }, { id: 3 }]);
  });
});
