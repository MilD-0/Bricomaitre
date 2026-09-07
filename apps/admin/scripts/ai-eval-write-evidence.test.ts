import { describe, expect, it } from 'vitest';
import { diffSnapshots, inputChecks } from './ai-eval-write-evidence';

describe('independent matrix write evidence', () => {
  it('checks taxonomy fields against their stored column names', () => {
    const input = {
      operation: 'create',
      entity: {
        kind: 'brand',
        data: {
          name: 'Atelier Nord',
          imageUrl: null,
          status: 'active',
        },
      },
    };
    const after = { brands: [{ id: 1, name: 'Atelier Nord', image: null, is_active: true }] };
    expect(
      inputChecks('manage_taxonomy', input, { brands: [] }, after).every((check) => check.passed),
    ).toBe(true);
    after.brands[0].is_active = false;
    expect(inputChecks('manage_taxonomy', input, { brands: [] }, after)[0].passed).toBe(false);
  });
  it('verifies each stored announcement language independently', () => {
    const input = { active: true, messageFr: 'Bienvenue', messageAr: 'مرحبا' };
    const after = {
      storefront_announcements: [
        { locale: 'fr', message: 'Bienvenue', active: true },
        { locale: 'ar', message: 'مرحبا', active: true },
      ],
    };
    expect(
      inputChecks('update_storefront_announcement', input, {}, after).every(
        (check) => check.passed,
      ),
    ).toBe(true);
    after.storefront_announcements[1].message = 'wrong';
    expect(inputChecks('update_storefront_announcement', input, {}, after).at(-1)?.passed).toBe(
      false,
    );
  });

  it('allows a new publication revision only when its content is preserved', () => {
    const document = { blocks: [{ id: 'hero', heading: 'Un outil' }], seo: { indexable: true } };
    const before = { landing_page_revisions: [{ landing_page_id: 1, revision: 7, document }] };
    const after = {
      landing_pages: [{ id: 1, status: 'draft' }],
      landing_page_revisions: [
        ...before.landing_page_revisions,
        { landing_page_id: 1, revision: 8, document: { ...document, seo: { indexable: false } } },
      ],
    };
    const input = { landingPageId: 1, expectedRevision: 7, active: false };
    expect(
      inputChecks('set_landing_page_active', input, before, after).every((check) => check.passed),
    ).toBe(true);
    after.landing_page_revisions[1].document = { ...document, blocks: [] };
    expect(inputChecks('set_landing_page_active', input, before, after).at(-1)?.passed).toBe(false);
  });
  it('detects insertion, deletion, and changed rows independent of row order', () => {
    expect(
      diffSnapshots(
        {
          products: [
            { id: 1, price: 10 },
            { id: 2, price: 20 },
          ],
        },
        {
          products: [
            { id: 3, price: 30 },
            { id: 1, price: 11 },
          ],
        },
      ),
    ).toEqual([
      { table: 'products', before: { id: 1, price: 10 }, after: { id: 1, price: 11 } },
      { table: 'products', before: { id: 2, price: 20 }, after: null },
      { table: 'products', before: null, after: { id: 3, price: 30 } },
    ]);
  });

  it('rejects a write that did not persist even if a tool could claim success', () => {
    const before = { products: [{ id: 1, price: 100, purchase_price: 60 }] };
    const input = { items: [{ productId: 1, changes: { price: 120 } }] };
    expect(inputChecks('update_products', input, before, before)[0].passed).toBe(false);
    const after = { products: [{ id: 1, price: '120.00', purchase_price: 60 }] };
    expect(
      inputChecks('update_products', input, before, after).every((check) => check.passed),
    ).toBe(true);
    after.products[0].purchase_price = 80;
    expect(inputChecks('update_products', input, before, after).at(-1)?.passed).toBe(false);
  });

  it('checks inventory deltas while allowing canonical availability updates', () => {
    const input = { mode: 'increase', items: [{ productId: 1, quantity: 3 }] };
    const before = {
      products: [
        { id: 1, inventory_quantity: 0, in_stock: false, availability_status: 'out_of_stock' },
      ],
    };
    const after = {
      products: [{ id: 1, inventory_quantity: 3, in_stock: true, availability_status: 'in_stock' }],
    };
    expect(
      inputChecks('adjust_inventory', input, before, after).every((check) => check.passed),
    ).toBe(true);
    after.products[0].inventory_quantity = 4;
    expect(inputChecks('adjust_inventory', input, before, after)[0].passed).toBe(false);
  });
});
