import { createDb } from '@bric/db/client';

let db: ReturnType<typeof createDb> | undefined;

export function getCatalogDb() {
  // JIT compilation costs hundreds of milliseconds for short catalog queries.
  // Bound this pool and scope the setting to catalog reads.
  return (db ??= createDb({
    max: 4,
    application_name: 'bric-storefront-catalog',
    options: '-c jit=off',
  }));
}
