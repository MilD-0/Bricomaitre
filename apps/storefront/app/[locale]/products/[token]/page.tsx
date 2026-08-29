import type { Metadata } from 'next';

import '../../../styles/product.css';
import '../../../styles/catalog.css';

import {
  ProductPageContent,
  resolveProductPageParams,
  type ProductPageProps,
} from './page-content';
import { buildMissingProductMetadata, buildProductMetadata } from '@/lib/product-seo';
import { getStorefrontProductDetail } from '@/lib/storefront-api';

export const revalidate = 900;
export const dynamicParams = true;

// Product HTML is generated and cached on first request. Admin mutations use
// signed tag invalidation; the interval is a bounded fallback if that signal
// fails, not the primary freshness mechanism.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, token } = await resolveProductPageParams(params);
  try {
    const response = await getStorefrontProductDetail(token);
    return response
      ? buildProductMetadata(response.item, locale)
      : buildMissingProductMetadata(locale);
  } catch {
    return buildMissingProductMetadata(locale);
  }
}

export default async function ProductPage(props: ProductPageProps) {
  return ProductPageContent(props);
}
