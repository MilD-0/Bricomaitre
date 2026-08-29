import { analyticsCopyAr } from './copy/ar';
import { analyticsCopyEn } from './copy/en';
import { analyticsCopyFr } from './copy/fr';

export type AnalyticsCopy = typeof analyticsCopyEn;

export function getAnalyticsCopy(locale: string): AnalyticsCopy {
  if (locale.startsWith('ar')) return analyticsCopyAr as unknown as AnalyticsCopy;
  if (locale.startsWith('fr')) return analyticsCopyFr as unknown as AnalyticsCopy;
  return analyticsCopyEn;
}
