import type { getDb } from '../../../db/src/client';
import { readEcotrackCatalog } from '../ecotrack-support';
import { toStorefrontEcotrackCatalogDto } from './dto';

type Database = ReturnType<typeof getDb>;

export async function readStorefrontEcotrackCatalog(db: Database) {
  const catalog = await readEcotrackCatalog(db);
  return toStorefrontEcotrackCatalogDto(catalog);
}
