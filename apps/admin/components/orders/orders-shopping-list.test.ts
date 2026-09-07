import { expect, it } from 'vitest';
import { buildGeneratedShoppingListDraft } from '../../lib/shopping-list-drafts';
import {
  buildShoppingListPrintHtml,
  buildShoppingListStateFromDraft,
} from './orders-shopping-list';

it('prints product photos through bounded thumbnails in both columns while retaining labels without images', async () => {
  const draft = await buildGeneratedShoppingListDraft({
    orders: [
      {
        id: 8,
        fullName: 'Customer',
        note: 'Call first',
        orderProducts: [
          {
            productId: 12,
            rawValue: '12',
            slug: 'drill',
            title: 'Drill <12>',
            quantity: 2,
            unitPrice: 100,
            lineTotal: 200,
            missing: false,
            thumbnailUrl: 'https://media.example/drill.jpg',
          },
          {
            productId: 13,
            rawValue: '13',
            slug: 'saw',
            title: 'Saw محفوظ',
            quantity: 1,
            unitPrice: 50,
            lineTotal: 50,
            missing: false,
            thumbnailUrl: null,
          },
        ],
      },
    ],
    sourceMode: 'selected',
    title: 'Gathering list',
    resolveProductDetails: async () => ({ inventoryQuantity: 3, purchasePrice: 30 }),
    resolveBrandName: async () => 'Tools',
  });
  const state = buildShoppingListStateFromDraft({
    ...draft,
    scopeKey: 'selected:8',
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedByName: 'Operator',
  });
  Object.assign(state.draftItems[0]!, {
    inventoryQuantity: 0,
    inventoryAppliedQuantity: 1,
    inventoryDecreaseQuantity: 0,
    inventoryShortageQuantity: 1,
    inventoryActionEligible: false,
    checked: true,
  });
  const html = buildShoppingListPrintHtml(state, 'ar', 'Previous', {
    generated: (value) => value,
    unitPrice: 'Price',
    purchasePrice: 'Cost',
    inventoryDecrease: 'Deduct',
    inventoryShortage: (count) => `Short ${count}`,
    notes: 'Notes',
  });
  expect(html.match(/<img /g)).toHaveLength(2);
  expect(html.match(/src="\/api\/orders\/shopping-list-thumbnail\/12\?v=/g)).toHaveLength(2);
  expect(html).not.toContain('src="https://media.example/drill.jpg"');
  expect(html).toContain('Drill &lt;12&gt;');
  expect(html).toContain('Saw محفوظ');
  expect(html).toContain('x2');
  expect(html).toContain('Call first');
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('Short 1');
});
