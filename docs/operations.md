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
Separate database roles restrict the Storefront API's access to approved tables
and columns, protecting catalog writes and Admin authentication data. Deployments
reconcile these permissions. Redis requires authentication on the private network.

Uploaded media is the deliberate exception to the single-host layout. Admin
writes objects to S3 and the Storefront serves them through CloudFront.
Order exports require Admin authorization, expire after 24 hours, and are deleted
by worker maintenance. The Admin S3 identity needs list, read, write, and delete
access for `exports/orders/`.
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

The normal release path is a verified pull request merged into `main`. The
resulting `main` commit gets a fresh CI run. Production release begins only
after that exact push run passes the required workflow, and it stops if a newer
`main` commit has already superseded it. Image groups build independently, but
production cutovers are serialized.

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

Infrastructure and application credentials must match the [environment
examples](../ops/env). Missing or mismatched secrets prevent a healthy deployment;
the deploy path provisions database roles on both new and existing volumes.

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

This proves that the remote artifact can be restored. Recovery still requires a
deliberate decision about the target release and production database; it is not
an automatic write into the live system.

## Observability

All three applications and both workers report the same release SHA to Sentry.
Web builds publish source maps. Application health routes include that release
SHA; worker heartbeats, request IDs, bounded logs, and job records attribute failures to a
release and request or task. External uptime monitoring observes the public
Storefront independently of the host.

The main operational sources are
[`deploy.yml`](../.github/workflows/deploy.yml),
[`compose.prod.yml`](../ops/docker/compose.prod.yml), and
[`ops/scripts`](../ops/scripts). They are authoritative when this explanation
and executable behavior diverge.

### Sentry issue triage

Use the three Sentry projects separately: `bricadmin` for Admin and workers,
`brico-api` for the public API, and `bricomaitre` for the Storefront. Review
production issues that are new, regressed, or escalating each day. Check open
operational failures and archived issues weekly. Treat a failing public route
or order flow as actionable even when the exception originates in a dependency.
For workers, compare the issue with its job history and request or job ID.

Classify each issue before changing its status:

- Keep an application defect or a customer-facing dependency failure open and
  assign its owner. Link the Sentry issue in the fix pull request.
- Archive a confirmed external browser or wrapper error until escalating.
  Record the exact origin before adding a client filter. Do not filter by error
  title alone or assume that a stackless syntax error is external.
- Resolve an issue in the release containing its fix, not when the code is
  written. After deployment, check for events tagged with that release and
  later releases. Reopen and investigate if the issue regresses. Older cached
  browser bundles may still report events from an earlier release.

The Storefront browser client drops errors only when every stack frame is from
an `app://` wrapper or a browser extension. Mixed and stackless errors remain
visible. All deployable processes should tag Sentry events with the release
SHA. A browser event without a release cannot establish whether a fix held;
verify the release tag on real production browser events after deployment.
The Storefront build passes the raw commit SHA as `NEXT_PUBLIC_SENTRY_RELEASE`;
`NEXT_PUBLIC_RELEASE` is the `sha-` prefixed image tag used by analytics.

Errors captured before the browser SDK initializes include sanitized source URLs,
line and column numbers in `browser_error`, when supplied by the browser. The
`capture_phase` tag distinguishes bootstrap capture from the initialized SDK.
Native wrapper and extension URLs retain their origin while losing credentials,
query strings and fragments. Use this evidence to investigate stackless errors;
a Facebook browser tag alone is insufficient to suppress an exception.

The existing project alerts email issue owners about high-priority issues.
Separate production regression alerts cover
[`bricadmin`](https://bricomaitre.sentry.io/monitors/alerts/6074157/),
[`brico-api`](https://bricomaitre.sentry.io/monitors/alerts/6074159/), and
[`bricomaitre`](https://bricomaitre.sentry.io/monitors/alerts/6074161/).
They email issue owners, fall back to active members, and use a 30-minute
notification interval. Add a separate alert for sustained
public order failures once a normal traffic baseline is established. Sentry
issue counts alone do not measure every customer-facing failure, because
expected 4xx responses are not exceptions.

### ECOTRACK sync failures

Catalog locations do not imply delivery tariff availability. A successful sync
records `unpricedWilayaIds` in its job summary and action history. Quotes for those
locations remain pending. Sync rejects empty catalogs and the loss of previously
priced wilayas, lists the lost IDs in the error, and preserves the saved catalog.
A confirmed carrier withdrawal of coverage needs an explicit catalog change;
repeated retries will not remove a previously available tariff automatically.

Shipment reconciliation records counters and up to 20 failure samples before
returning or throwing. Each sample identifies the provider, endpoint or persistence
stage, batch number, affected count, up to 10 internal order IDs, HTTP status,
SQLSTATE or network code, retry delay when supplied, and source file positions.
`failureCount` counts failed operations, not shipments; `failuresTruncated` counts
omitted samples. Two endpoint failures in one batch count as two operations but
each shipment counts only once in `failed`.

Partial failures emit a Sentry warning and a worker log with the job ID and release.
Complete failures attach the saved summary as `job_diagnostics` to the queue's
Sentry exception. Correlate those IDs with Admin job history before its 24-hour
retention expires. Diagnostics exclude raw carrier responses, request URLs,
tracking numbers, SQL parameters, and customer contact information. Use the
internal order IDs for an authorized lookup when more evidence is needed.

A carrier status that conflicts with the local order transition rules is saved
with the carrier evidence. The local order status remains unchanged. The shipment
workspace displays both statuses for review, including on mobile. These conflicts
are not failed syncs: a successful reconciliation can refresh every shipment while
leaving local decisions for an operator to review. An aligned carrier update or a
local correction clears the displayed discrepancy. Check order history and carrier
activity before correcting a terminal local status.

### Catalog search performance

PostgreSQL generated columns store normalized product, brand and category search
text. They follow writes automatically, including edits and Undo/Redo; no scheduled
index refresh is needed. Catalog reads combine the current active brand/category
documents and retain French, Arabic, identifier and fuzzy matching. A separate,
bounded API catalog pool disables PostgreSQL JIT compilation because its overhead
dominates these short queries. Compare query plans and returned product ordering
when changing search, rather than relying solely on Sentry's slow-query count.
