import { describe, expect, it } from 'vitest';

import { GET as canonicalAssetsGet } from '../../storefront/assets/route';
import { GET as compatibilityAssetsGet } from './assets/route';
import { GET as canonicalBrandsGet } from '../../storefront/brands/route';
import { GET as compatibilityBrandsGet } from './brands/route';
import { GET as canonicalCategoriesGet } from '../../storefront/categories/route';
import { GET as compatibilityCategoriesGet } from './categories/route';
import { GET as canonicalEcotrackGet } from '../../storefront/ecotrack/catalog/route';
import { GET as compatibilityEcotrackGet } from './ecotrack/catalog/route';
import { GET as canonicalOrderGet, PATCH as canonicalOrderPatch } from '../../storefront/orders/[id]/route';
import { GET as compatibilityOrderGet, PATCH as compatibilityOrderPatch } from './orders/[id]/route';
import { POST as canonicalOrdersPost } from '../../storefront/orders/route';
import { POST as compatibilityOrdersPost } from './orders/route';
import { GET as canonicalProductBuildFeedGet } from '../../storefront/products/build-feed/route';
import { GET as canonicalProductsGet } from '../../storefront/products/route';
import { GET as compatibilityProductBuildFeedGet } from './products/build-feed/route';
import { GET as compatibilityProductsGet } from './products/route';

describe('app/api/storefront compatibility routes', () => {
  it('re-exports the canonical storefront route handlers', () => {
    expect(compatibilityProductsGet).toBe(canonicalProductsGet);
    expect(compatibilityBrandsGet).toBe(canonicalBrandsGet);
    expect(compatibilityCategoriesGet).toBe(canonicalCategoriesGet);
    expect(compatibilityAssetsGet).toBe(canonicalAssetsGet);
    expect(compatibilityEcotrackGet).toBe(canonicalEcotrackGet);
    expect(compatibilityOrdersPost).toBe(canonicalOrdersPost);
    expect(compatibilityOrderGet).toBe(canonicalOrderGet);
    expect(compatibilityOrderPatch).toBe(canonicalOrderPatch);
    expect(compatibilityProductBuildFeedGet).toBe(canonicalProductBuildFeedGet);
  });
});
