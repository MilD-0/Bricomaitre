import { describe, expect, it } from 'vitest';
import {
  landingPageDocumentSchema,
  landingPageOutline,
  moveLandingPageRow,
  preserveCheckoutPosition,
} from './landing-pages';

const document = landingPageDocumentSchema.parse({
  schemaVersion: 2,
  seo: { title: 'Test', description: 'Test' },
  blocks: [
    { id: 'hero', type: 'product-hero', heading: 'Test', primaryCtaLabel: 'Order' },
    { id: 'cta', type: 'final-cta', heading: 'Order', primaryCtaLabel: 'Order' },
  ],
});
describe('checkout layout', () => {
  it('keeps old revisions at the end and moves either kind of row across checkout', () => {
    expect(landingPageOutline(document).map((row) => row?.id ?? 'checkout')).toEqual([
      'hero',
      'cta',
      'checkout',
    ]);
    const moved = moveLandingPageRow(document, 2, -1);
    expect(moved.checkoutPosition).toBe(1);
    expect(moved.schemaVersion).toBe(3);
    expect(moveLandingPageRow(moved, 0, 1).checkoutPosition).toBe(0);
    expect(moveLandingPageRow(moved, 2, -1).checkoutPosition).toBe(2);
  });
  it('rejects invalid boundaries and preserves placement beside surviving content after AI edits', () => {
    expect(landingPageDocumentSchema.safeParse({ ...document, checkoutPosition: 3 }).success).toBe(
      false,
    );
    expect(landingPageDocumentSchema.safeParse({ ...document, checkoutPosition: -1 }).success).toBe(
      false,
    );
    expect(
      preserveCheckoutPosition({ ...document, checkoutPosition: 1 }, [document.blocks[1]!]),
    ).toBe(0);
    expect(
      preserveCheckoutPosition({ ...document, checkoutPosition: 2 }, [document.blocks[1]!]),
    ).toBe(1);
  });
});
