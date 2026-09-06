\set ON_ERROR_STOP on
\if :{?storefront_origin}
\else
  \set storefront_origin 'http://127.0.0.1:3402'
\endif
\echo 'Adding the reset-relative live queue'
\ir /seed/seed/90-live.sql
\ir /seed/seed/60-carrier-completion.sql
\ir /seed/seed/99-live-verify.sql

ANALYZE;
