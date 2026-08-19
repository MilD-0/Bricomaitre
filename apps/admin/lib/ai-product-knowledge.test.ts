import { describe, expect, it } from 'vitest';

import {
  buildProductRelationEvidence,
  hasSufficientProductRelationEvidence,
} from './ai-product-knowledge';

const source = {
  title: 'Perceuse A',
  description: 'Mandrin de 13 mm.',
  category: 'Perceuses',
  brand: 'Acme',
};
const target = {
  title: 'Foret B',
  description: 'Tige de 13 mm pour mandrin standard.',
  category: 'Forets',
  brand: 'Acme',
};

describe('AI product-relation evidence', () => {
  it('stores the actual catalog fields and administrator context shown to the model', () => {
    expect(
      buildProductRelationEvidence({
        sourceProduct: source,
        targetProduct: target,
        adminContext: 'Verified from packaging.',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Source catalog identity',
          excerpt: expect.stringContaining('Perceuse A'),
        }),
        { label: 'Source catalog description', excerpt: 'Mandrin de 13 mm.' },
        { label: 'Target catalog description', excerpt: 'Tige de 13 mm pour mandrin standard.' },
        { label: 'Administrator-provided evidence', excerpt: 'Verified from packaging.' },
      ]),
    );
  });

  it('does not treat generated reasoning or product titles alone as compatibility evidence', () => {
    const titleOnly = buildProductRelationEvidence({
      sourceProduct: { ...source, description: null },
      targetProduct: { ...target, description: null },
    });
    expect(hasSufficientProductRelationEvidence('compatible_with', titleOnly)).toBe(false);
    expect(hasSufficientProductRelationEvidence('accessory_for', titleOnly)).toBe(false);
  });

  it('accepts paired catalog descriptions or explicit administrator evidence', () => {
    const descriptions = buildProductRelationEvidence({
      sourceProduct: source,
      targetProduct: target,
    });
    expect(hasSufficientProductRelationEvidence('requires', descriptions)).toBe(true);

    const adminEvidence = buildProductRelationEvidence({
      sourceProduct: { ...source, description: null },
      targetProduct: { ...target, description: null },
      adminContext: 'Both model numbers are listed together on the package.',
    });
    expect(hasSufficientProductRelationEvidence('compatible_with', adminEvidence)).toBe(true);
  });
});
