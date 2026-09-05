\set ON_ERROR_STOP on
\echo 'Resetting the demo database'
\ir /seed/seed/00-reset.sql
\echo 'Loading reference data'
\ir /seed/seed/10-reference.sql
\echo 'Building the catalog'
\ir /seed/seed/20-catalog.sql
\echo 'Generating historical commerce'
\ir /seed/seed/30-commerce.sql
\echo 'Generating historical analytics'
\ir /seed/seed/40-analytics.sql
\echo 'Populating operations and integrations'
\ir /seed/seed/50-operations.sql
\echo 'Verifying the immutable dataset'
\ir /seed/seed/99-verify.sql

VACUUM ANALYZE;
