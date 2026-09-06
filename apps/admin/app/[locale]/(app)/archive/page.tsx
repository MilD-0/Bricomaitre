import { getDb, hasDb } from '@bric/db/client';

import { ProductArchive } from '../../../../components/products/product-archive';
import {
  archivedProductListQuerySchema,
  loadArchivedProductsPage,
} from '../../../../lib/product-archive';
import { requirePageAccess } from '../../../../lib/page-access';

export default async function ProductArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requirePageAccess(locale, 'products');
  const rawQuery = await searchParams;
  const query = archivedProductListQuerySchema.parse({
    page: Array.isArray(rawQuery.page) ? rawQuery.page[0] : rawQuery.page,
    limit: 50,
    search: '',
  });
  const initialData = hasDb()
    ? await loadArchivedProductsPage(getDb(), query)
    : {
        items: [],
        pagination: {
          page: 1,
          limit: query.limit,
          totalItems: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
  return (
    <ProductArchive
      key={`${initialData.pagination.page}:${initialData.pagination.totalItems}`}
      initialData={initialData}
    />
  );
}
