import {
  bigserial,
  bigint,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { adminSchema } from './namespaces';

export const migrationIdMap = adminSchema.table(
  "migration_id_map",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    collectionName: text("collection_name").notNull(),
    mongoId: text("mongo_id").notNull(),
    newId: bigint("new_id", { mode: "number" }).notNull(),
    migratedAt: timestamp("migrated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_mig_collection_mongo").on(t.collectionName, t.mongoId),
    index("idx_mig_lookup").on(t.collectionName, t.newId),
  ]
);
