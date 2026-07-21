import { describe, expect, it } from 'vitest';

import { shopperAssistantInstructions, toShopperProduct } from './storefront-ai';

describe('storefront shopper AI helpers', () => {
  it('exposes only customer-safe catalog fields', () => {
    const product = toShopperProduct({ id: 7, slug: 'drill', title: 'Drill', title_ar: 'مثقاب', summary: 'Reliable drill', summary_ar: 'مثقاب موثوق', description: 'Description', description_ar: 'الوصف', price: 1200, OldPrice: 1400, oldPrice: 1400, inStock: true, availabilityStatus: 'in_stock', brandInfo: { name: 'Acme' }, categoryInfo: { name: 'Tools' }, images: ['https://example.com/drill.jpg'] } as never);
    expect(product).toMatchObject({ id: 7, slug: 'drill', title: 'Drill', price: 1200, brand: 'Acme', category: 'Tools' });
    expect(product).not.toHaveProperty('purchasePrice');
  });

  it('keeps the assistant strictly shopper-facing', () => {
    expect(shopperAssistantInstructions('ar')).toContain('Arabic');
    expect(shopperAssistantInstructions('fr')).toContain('Never mention internal systems');
    expect(shopperAssistantInstructions('fr')).toContain('Algerian dinars');
    expect(shopperAssistantInstructions('fr')).toContain('never label them Dhs');
  });

  it('normalizes contradictory availability using the public in-stock flag', () => {
    const product = toShopperProduct({ id: 7, slug: 'drill', title: 'Drill', title_ar: 'مثقاب', summary: '', summary_ar: '', description: '', description_ar: '', price: 1200, OldPrice: null, oldPrice: null, inStock: true, availabilityStatus: 'out_of_stock', brandInfo: null, categoryInfo: null, images: [] } as never);

    expect(product.availabilityStatus).toBe('in_stock');
  });
});
