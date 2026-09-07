import type { AdminAiAnalyticsFocusDimension, DatasetSpec } from '../focus-contract';
import { rankedView } from './semantics';
export const catalogDatasets = {
  products: {
    views: ['catalog'],
    paths: { catalog: ['products'] },
    effectiveRangeKey: 'catalog',
    additionalEffectiveRangeKeys: ['catalogStorefront'],
    definition:
      'Filtered product decision view combining first-posted units, paid outcomes, projected contribution, delivery speed, and available Storefront interest.',
    dateBasis: 'First-posted cohort; Storefront fields retain their separately declared range.',
    sources: ['orders', 'ecotrack', 'storefront', 'assumptions'],
    totalSemantics: rankedView,
  },
  basket_pairs: {
    views: ['catalog'],
    paths: { catalog: ['basketPairs'] },
    effectiveRangeKey: 'catalog',
    definition: 'Products co-occurring in submitted Bricomaitre order baskets.',
    dateBasis: 'Order-created date.',
    sources: ['orders'],
    totalSemantics: rankedView,
  },
  wilayas: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'wilayas'] },
    effectiveRangeKey: 'catalog',
    definition: 'Customer operational outcomes across Algeria’s 58 wilayas.',
    dateBasis: 'First-posted cohort and actual elapsed calendar-time outcomes.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  communes: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'communes'] },
    effectiveRangeKey: 'catalog',
    definition: 'Customer operational outcomes by commune.',
    dateBasis: 'First-posted cohort and actual elapsed calendar-time outcomes.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  meta_regions: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'metaRegions'] },
    effectiveRangeKey: 'catalog',
    definition: 'Meta aggregate delivery-region diagnostics.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics:
      'Meta regions are not customer wilayas and cannot be joined as customer identity.',
  },
  customers: {
    views: ['catalog'],
    paths: { catalog: ['customers', 'rows'] },
    effectiveRangeKey: 'catalog',
    definition:
      'Phone-normalized customer demand and paid contribution. Order value includes submitted demand; paid contribution includes only paid outcomes.',
    dateBasis: 'Order-created customer cohort date.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: rankedView,
  },
} satisfies Partial<Record<AdminAiAnalyticsFocusDimension, DatasetSpec>>;
