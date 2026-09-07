import { createDb } from '@bric/db/client';

let db: ReturnType<typeof createDb> | undefined;

export function getReportingDb() {
  // Allow two reporting queries to overlap without spawning parallel PostgreSQL workers.
  // Keep the pool separate and bounded so orders and public catalog reads retain capacity.
  return (db ??= createDb({
    max: 2,
    application_name: 'bric-admin-reporting',
    options: '-c max_parallel_workers_per_gather=0',
  }));
}
