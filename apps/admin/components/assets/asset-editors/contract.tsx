'use client';
import {
  type AssetBannerRecord,
  type FeaturedProductGroupRecord,
  type ProductCardRecord,
} from '../../../lib/assets';

export type AssetsWorkspaceCopy = {
  title: string;
  banners: string;
  groups: string;
  cards: string;
  landingPages: string;
  create: string;
  edit: string;
  delete: string;
  cancel: string;
  save: string;
  close: string;
  active: string;
  inactive: string;
  actions: string;
  moveUp: string;
  moveDown: string;
  modified: string;
  noRecords: string;
  confirmDelete: string;
  product: string;
  order: string;
  bannerTitle: string;
  bannerTitleAr: string;
  landscape: string;
  portrait: string;
  groupName: string;
  groupNameAr: string;
  cta: string;
  ctaAr: string;
  link: string;
  recommendationPriority: string;
  products: string;
  brands: string;
  categories: string;
  noSelection: string;
  cardTitleFr: string;
  cardTitleAr: string;
  cardDescriptionFr: string;
  cardDescriptionAr: string;
  characteristicsFr: string;
  characteristicsAr: string;
  characteristicsRequirement: string;
  productSearch: string;
  productEmpty: string;
  selected: string;
  remove: string;
  validation: string;
  mutationFailed: string;
};

export function validationMessage(copy: AssetsWorkspaceCopy, field: PropertyKey | undefined) {
  if (field === 'characteristicsFr' || field === 'characteristicsAr')
    return copy.characteristicsRequirement;
  const labels: Record<string, string> = {
    title: copy.bannerTitle,
    titleAr: copy.bannerTitleAr,
    imageUrlLandscape: copy.landscape,
    imageUrlPortrait: copy.portrait,
    name: copy.groupName,
    nameAr: copy.groupNameAr,
    cta: copy.cta,
    ctaAr: copy.ctaAr,
    link: copy.link,
    productId: copy.product,
    titleFr: copy.cardTitleFr,
    descriptionFr: copy.cardDescriptionFr,
    descriptionAr: copy.cardDescriptionAr,
  };
  const label = field === undefined ? undefined : labels[String(field)];
  return label ? `${label}: ${copy.validation}` : copy.validation;
}

export type EditorState =
  | { kind: 'banner'; item?: AssetBannerRecord }
  | { kind: 'group'; item?: FeaturedProductGroupRecord }
  | { kind: 'card'; item?: ProductCardRecord };
