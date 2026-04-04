export type MetaCatalogProduct = {
  id: number;
  title: string;
  description?: string | null;
  inventoryQuantity: number;
  price: number | string;
  brandId?: number | null;
  images: string[];
  updatedAt: string | Date;
};

export type MetaCatalogExportRow = {
  id: string;
  title: string;
  description: string;
  availability: string;
  condition: string;
  price: string;
  link: string;
  imageLink: string;
  brand: string;
};

export const META_CATALOG_EXPORT_HEADERS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
] as const;

function formatExportTimestampPart(value: number) {
  return String(value).padStart(2, '0');
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
  return products.map((product) => ({
    id: String(product.id),
    title: product.title,
    description: product.description ?? '',
    availability: product.inventoryQuantity > 0 ? 'in stock' : 'out of stock',
    condition: 'new',
    price: `${typeof product.price === 'number' ? product.price : Number.parseFloat(product.price) || 0} DZD`,
    link: `https://bricomaitre.com/products/${product.id}`,
    imageLink: imageLinkByProductId.get(product.id) ?? '',
    brand: product.brandId ? brandNameById.get(product.brandId) ?? 'Sans marque' : 'Sans marque',
  }));
}

export function buildMetaCatalogImageKeySeed(product: Pick<MetaCatalogProduct, 'id' | 'images' | 'updatedAt'>) {
  const updatedAt = product.updatedAt instanceof Date ? product.updatedAt : new Date(product.updatedAt);
  return `${product.id}:${updatedAt.toISOString()}:${product.images[0] ?? ''}`;
}
