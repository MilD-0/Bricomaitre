\set ON_ERROR_STOP on
\echo 'Adding the reset-relative live queue'
\ir /seed/seed/90-live.sql
\ir /seed/seed/60-carrier-completion.sql
\ir /seed/seed/99-live-verify.sql

ANALYZE;
