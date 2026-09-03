# Operations

Bricomaitre runs on one 8 GB VPS. GitHub Actions builds and releases the system;
the repository's workflows, manifests, and scripts are the executable record of
how production is operated.

## Production topology

Nginx terminates public traffic and routes each domain to the active blue or
green application slot. The host also runs PostgreSQL, Redis, three deployable
applications, and two dedicated workers:

- the Customer Storefront;
- the Storefront API;
- the Commerce Operating System;
- the Admin worker for fulfilment, reporting, and AI jobs; and
- the Storefront analytics and marketing worker.

PostgreSQL owns durable application state and outboxes. Redis owns bounded
caches, rate limits, queues, and the fast side of idempotency.
Fresh installations create separate owner, privileged Admin, and restricted
Storefront API database roles. The public API role receives data access through
an explicit table allowlist, can only read the EcoTrack reference catalog in the
Admin schema, can update only catalog engagement-counter columns, and cannot
change prices or content, read Admin authentication data, or create schema
objects. The allowlist is reconciled before and after migrations on every
deployment. Redis requires a password even though it is reachable only on the
private Compose network.
Uploaded media is the deliberate exception to the single-host layout. Admin
writes objects to S3 and the Storefront serves them through CloudFront.
Order-export artifacts remain private, are served only through an authorized
Admin route, expire after 24 hours, and are physically deleted by hourly Admin
worker maintenance. The Admin S3 principal therefore needs bucket listing plus
object read, write, and delete access for `exports/orders/`.
Database backups use a different private bucket and dedicated credentials, so
public-media authority cannot read or replace backups.

## Build and provenance

The Node, pnpm, PostgreSQL, Redis, GitHub Action, container-base, and release
tool versions are pinned. A verified commit produces six application images:
the three web/API processes, two workers, and the migration runner.

Buildx publishes each image with provenance and an SBOM. The release workflow
then signs it through GitHub's OIDC identity, resolves it to a digest, and
assembles a manifest that accepts only the expected Bricomaitre image names.
Runtime license bundles travel with the relevant images. The commit SHA is
carried into every process as the release identity used by health checks and
Sentry.

## Release path

A push to `main` starts CI. Production release begins only after that exact
commit passes the required workflow, and it stops if a newer `main` commit has
already superseded it. Image groups build independently, but production
cutovers are serialized.

The deploy job then:

1. creates an immutable release directory and transfers only the runtime
   bundle;
2. verifies the signed, digest-pinned image manifest and migration safety;
3. reconciles the persistent PostgreSQL roles, rotates their configured
   passwords, and verifies authenticated Redis health;
4. starts the candidate Storefront API in the inactive slot and checks its live
   catalog contract;
5. applies migrations, then proves that the previous slot remains healthy and
   rollback-compatible;
6. starts the candidate Storefront, Admin, and Admin worker and waits for their
   readiness checks;
7. refreshes persisted reporting before the release becomes visible;
8. switches Nginx to the candidate and runs public smoke checks across health,
   both locales, catalog, checkout, robots, and sitemap behavior; and
9. starts the analytics worker, records the current and previous verified
   releases, and removes the inactive application processes.

The public Storefront remains on the old slot until the candidate is ready.
Workers are switched deliberately so two versions do not consume the same
operation queue during a normal release.

Before the first release that enables role isolation and Redis authentication,
populate `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_STOREFRONT_PASSWORD`, and
`REDIS_PASSWORD` in `infra.env`; place the matching database and Redis
credentials in every application environment file. This is a coordinated
credential cutover: rendering or starting the stack intentionally fails when
an infrastructure secret is absent, and an application with a mismatched
secret remains unhealthy rather than connecting anonymously. The deploy path
provisions roles on existing PostgreSQL volumes as well as fresh installations,
so no manual SQL step is required.

## Failure and rollback

A missing image, unsafe migration path, failed catalog preflight, unhealthy
service, failed integration verification, reporting refresh failure, Nginx
failure, or smoke-check failure blocks the release.

Before cutover, cleanup removes the candidate and restores the previous image
state. After routing begins to change, the deployment first tries to restore
the previous Nginx configuration and slot. If routing cannot be restored
safely, it preserves the candidate processes and digests rather than removing
something that may still be serving traffic.

Explicit rollback targets the recorded previous verified release, starts it in
the inactive slot, checks every service, switches Nginx, runs public smoke
checks, and only then retires the current slot.

## Runtime constraints

Every service has a memory reservation, hard limit, process limit, bounded log
rotation, health check, and deliberate OOM priority. The Customer-facing
Storefront and API receive greater protection under host pressure than Admin
and background work. Workers have separate memory envelopes and heartbeats, so
long jobs cannot share an unbounded web process.

Application containers drop Linux capabilities and prevent privilege
escalation. Most roots are read-only; writable paths are limited to explicit
temporary or cache storage. The Storefront cache has size, age, and pruning
bounds. A host timer checks its memory, and Docker live restore keeps running
containers alive across daemon restarts.

## Backups and recovery

A scheduled job creates a compressed PostgreSQL dump, checks its gzip integrity,
uploads it to private S3, and applies local retention. The backup identity and
bucket are validated before upload. A separate weekly job downloads the latest
remote backup and restores it into an isolated, networkless PostgreSQL
container. The drill rejects artifacts older than the configured freshness
window, verifies the migration ledger and minimum product/order row floors, and
sends start, success, and failure check-ins to an external dead-man monitor
before deleting the temporary container and volume.

This proves that the remote artifact can be restored, not merely that a backup
command returned successfully. Recovery still requires a deliberate decision
about the target release and production database; it is not an automatic write
into the live system.

## Observability

All three applications and both workers report the same release SHA to Sentry.
Web builds publish source maps. Application health routes include that release
SHA; worker heartbeats,
request IDs, bounded logs, and job records make failures attributable to a
release and request or task. External uptime monitoring observes the public
Storefront independently of the host.

The main operational sources are
[`deploy.yml`](../.github/workflows/deploy.yml),
[`compose.prod.yml`](../ops/docker/compose.prod.yml), and
[`ops/scripts`](../ops/scripts). They are authoritative when this explanation
and executable behavior diverge.
