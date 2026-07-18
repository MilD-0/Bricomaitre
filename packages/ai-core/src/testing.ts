import type { ProductRelationGenerator } from './product-knowledge';

export function createFixedProductRelationGenerator(
  result: Awaited<ReturnType<ProductRelationGenerator['generate']>>,
): ProductRelationGenerator {
  return { generate: async () => result };
}
