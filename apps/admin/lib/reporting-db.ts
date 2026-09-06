import { createDb } from '@bric/db/client';

let db: ReturnType<typeof createDb> | undefined;

export function getReportingDb() {
  // Snapshot reads share one connection and cannot spawn extra PostgreSQL workers.
  // Their nested query fan-out must leave capacity for orders and public catalog reads.
  return (db ??= createDb({
    max: 1,
    application_name: 'bric-admin-reporting',
    options: '-c max_parallel_workers_per_gather=0',
  }));
}
