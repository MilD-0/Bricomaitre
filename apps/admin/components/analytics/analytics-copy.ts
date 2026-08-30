import { analyticsCopyAr } from './copy/ar';
import { analyticsCopyEn } from './copy/en';
import { analyticsCopyFr } from './copy/fr';

type WidenCopyValues<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? readonly WidenCopyValues<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: WidenCopyValues<T[Key]> }
      : T;

export type AnalyticsCopy = WidenCopyValues<typeof analyticsCopyEn>;

export function getAnalyticsCopy(locale: string): AnalyticsCopy {
  if (locale.startsWith('ar')) return analyticsCopyAr;
  if (locale.startsWith('fr')) return analyticsCopyFr;
  return analyticsCopyEn;
}
