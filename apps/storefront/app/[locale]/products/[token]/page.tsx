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

// A per-request CSP nonce cannot be embedded safely in cached HTML. Product
// data remains tag-cached and invalidated by Admin, while the lightweight page
// shell is rendered per request so every inline Next.js script has a fresh nonce.
export const dynamic = 'force-dynamic';

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
