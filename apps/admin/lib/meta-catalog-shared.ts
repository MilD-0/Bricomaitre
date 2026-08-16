export type MetaCatalogProduct = {
  id: number;
  slug: string | null;
  title: string;
  description?: string | null;
  inStock: boolean;
  inventoryQuantity: number;
  price: number | string;
  oldPrice?: number | string | null;
  brandId?: number | null;
  images: string[];
  updatedAt: string | Date;
};

export type MetaCatalogExportRow = {
  id: string;
  contentId: string;
  title: string;
  description: string;
  availability: string;
  condition: string;
  price: string;
  salePrice: string;
  link: string;
  imageLink: string;
  brand: string;
};

export const META_CATALOG_EXPORT_HEADERS = [
  'id',
  'content_id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'sale_price',
  'link',
  'image_link',
  'brand',
] as const;

const DEFAULT_STOREFRONT_BASE_URL = 'https://bricomaitre.com';

function parseProductPrice(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number.parseFloat(value) || 0;
  }

  return null;
}

function formatExportTimestampPart(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getStorefrontBaseUrl() {
  return normalizeBaseUrl(process.env.STOREFRONT_BASE_URL ?? DEFAULT_STOREFRONT_BASE_URL);
}

export function buildMetaCatalogExportFileName(now = new Date()) {
  const timestamp = [
    now.getFullYear(),
    formatExportTimestampPart(now.getMonth() + 1),
    formatExportTimestampPart(now.getDate()),
    '-',
    formatExportTimestampPart(now.getHours()),
    formatExportTimestampPart(now.getMinutes()),
    formatExportTimestampPart(now.getSeconds()),
  ].join('');

  return `meta-catalog-export-${timestamp}.xlsx`;
}

export function buildMetaCatalogExportRows(
  products: MetaCatalogProduct[],
  brandNameById: Map<number, string>,
  imageLinkByProductId: Map<number, string>,
) {
  return products.map((product) => {
    const price = parseProductPrice(product.price) ?? 0;
    const compareAtPrice = parseProductPrice(product.oldPrice);
    const hasCompareAtPrice = compareAtPrice !== null && compareAtPrice > 0;

    return {
      id: String(product.id),
      contentId: String(product.id),
      title: product.title,
      description: product.description ?? '',
      availability: product.inStock ? 'in stock' : 'out of stock',
      condition: 'new',
      price: `${hasCompareAtPrice ? compareAtPrice : price} DZD`,
      salePrice: hasCompareAtPrice ? `${price} DZD` : '',
      link: `${getStorefrontBaseUrl()}/products/${product.slug ?? product.id}`,
      imageLink: imageLinkByProductId.get(product.id) ?? '',
      brand: product.brandId
        ? (brandNameById.get(product.brandId) ?? 'Sans marque')
        : 'Sans marque',
    };
  });
}
