import { describe, expect, it } from 'vitest';
import { selectHomepageBrands } from './assets';

describe('homepage brand payload', () => {
  it('keeps featured brands and the brands required by displayed products without shipping the whole taxonomy', () => {
    const brands = Array.from({ length: 1600 }, (_, id) => ({ id, featured: id === 1599 }));
    const selected = selectHomepageBrands(brands, [
      { brandId: 1300 },
      { brandId: 1400 },
      { brandId: null },
    ]);
    expect(selected).toHaveLength(26);
    expect(selected.map((brand) => brand.id)).toEqual(expect.arrayContaining([1300, 1400, 1599]));
    expect(selected.some((brand) => brand.id === 1200)).toBe(false);
  });
});
