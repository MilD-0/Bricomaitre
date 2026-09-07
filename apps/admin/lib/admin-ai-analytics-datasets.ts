import type { AdminAiAnalyticsFocusDimension, DatasetSpec } from './ai-analytics/focus-contract';
import { economicsDatasets } from './ai-analytics/datasets/economics';
import { acquisitionDatasets } from './ai-analytics/datasets/acquisition';
import { storefrontDatasets } from './ai-analytics/datasets/storefront';
import { catalogDatasets } from './ai-analytics/datasets/catalog';
export const adminAiAnalyticsDatasetSpecs: Record<AdminAiAnalyticsFocusDimension, DatasetSpec> = {
  ...economicsDatasets,
  ...acquisitionDatasets,
  ...storefrontDatasets,
  ...catalogDatasets,
};
