# Demo

The demo runs Bricomaitre's real applications and workers against a synthetic
commerce operation. Visitors can place an order, work through confirmation and
fulfillment, change the catalog, and inspect the resulting records. The same
database supports customer browsing and the Commerce Operating System.

[Storefront](https://bricomaitre.mildsauce.cloud) ·
[Admin](https://bricomaitre-admin.mildsauce.cloud)

The hosted instance runs on my own machine over an unreliable connection. It
may be slow or offline. You can run it locally, or
[email me](mailto:mayldsauce@gmail.com) if you need access at a particular time.
Its data is shared between visitors and resets every six hours. No production
credentials or business data are used.

## Run it locally

The Docker-only [installation bundle](../ops/demo/release/README.md) pulls
prebuilt application and media images. It needs Docker with Compose, but no
Node.js installation, source checkout, or external accounts. Extract a demo
release and run:

```sh
docker compose up -d
```

To build from this checkout, install Node.js 24, Corepack, and Docker with
Compose, then run:

```sh
corepack enable
pnpm install
./demo up
```

The source launcher downloads and prepares catalog images on its first run,
builds the application images, and initializes the database. Initial setup can
take several minutes. The bundle includes the prepared media and skips those
source downloads. See its installation notes for ports, resource allowances,
reset commands, and removal.

Open the Storefront at <http://127.0.0.1:3402> and Admin at
<http://127.0.0.1:3400>. Click **Enter the demo** to create a real local session
with developer RBAC. The entry point bypasses external identity proof, not the
application's session handling or permissions.

For the source installation:

```sh
./demo urls       # Print entry points
./demo reset      # Discard demo edits and restore the dataset
./demo down       # Remove containers, keep data volumes
./demo schedule   # Install the current user's six-hour systemd reset timer
```

The source launcher resets the dataset as part of `./demo up`. To pause and
resume without resetting, use `./demo compose stop` and `./demo compose start`.
Bundle installations have their own Compose project and volumes; do not run
both on the same ports.

## Real application behavior, local dependencies

The [Compose stack](../ops/demo/compose.yml) runs the Storefront, canonical
Storefront API, Commerce Operating System, Admin worker, and analytics and
marketing worker. It gives them dedicated PostgreSQL, Redis, and S3-compatible
object storage. One Compose project manages separate containers with per-service
resource limits and application health checks.

External dependencies have local replacements:

- [Demo authentication](../apps/admin/lib/demo-auth.ts) supplies the seeded
  operator identity through the normal session system.
- [Provider substitutes](../ops/demo/mock-services.mjs) handle both EcoTrack
  integrations, Meta, Google reporting and conversion endpoints, and TikTok.
  Carrier state follows posting and shipment operations. Seeded reporting data
  also makes acquisition and Search Console views useful before any interaction.
- MinIO handles actual object uploads and reads. Images and generated artifacts
  pass through the application's storage code.

The provider substitutes support repeatable rate-limit, unavailable-service,
and malformed-response scenarios through `x-demo-failure` or `__demo_failure`.
Workers still process their queues and integration responses. This lets the
demo exercise failure handling without contacting a carrier or sending a real
marketing conversion. It does not prove compatibility with every live provider
response.

## A dataset built in dependency order

A populated product grid was insufficient. Orders need line items, shipment
outcomes need status histories, and financial reporting needs costs and dates
that agree with those records. The [seed pipeline](../ops/demo/postgres/seed.sql)
builds those dependencies in order:

1. Algerian reference data, including 58 wilayas and 1,541 communes.
2. Catalog records, taxonomy, media, prices, and inventory.
3. Customers, orders, line items, status histories, and carrier outcomes.
4. Traffic, attribution, reporting facts, acquisition costs, and financial history.
5. Operational records, integration state, and assistant histories, followed by
   cross-record verification.

The baseline after a reset contains:

| Data                     |     Count |
| ------------------------ | --------: |
| Products                 |     3,884 |
| Exact-product images     |     9,065 |
| Orders                   |   250,800 |
| Order line items         | 1,003,200 |
| Carrier shipment records |   200,888 |

Historical reporting spans more than four years. Its rollups represent
12 million synthetic sessions and 72 million synthetic events; these are not
72 million retained raw event rows. A fresh seven-day window includes 68,400
sessions and 410,400 raw journey events, linked to recent orders. All these
figures describe generated demonstration data, not production traffic or a
throughput benchmark.

### Public catalog, generated business history

The catalog combines Amazon's Shopping Queries dataset, Shopping Queries Image
Dataset, and Amazon Berkeley Objects. The
[source lock](../ops/demo/data/sources.lock.json) records revisions and checksums;
the [generated manifest](../ops/demo/data/generated-manifest.json) covers the
normalized inputs. Asset and dataset terms remain in [NOTICE](../NOTICE).

Gallery depth follows the available photos of each exact product. The catalog
was reduced rather than padded with unrelated pictures to meet a gallery quota.
The [image pipeline](../ops/demo/scripts/prepare-catalog-images.mjs) bounds
download sizes, retries failed transfers, retains originals for rebuilds, and
produces optimized WebP files. Browsers fetch those files from the demo's object
storage, never from the dataset's source hosts.

Merchandising received a separate editorial pass: four homepage cards, two hero
compositions, brand logos, and deliberate selections for top products and
featured groups. The seed checks that these placements use the curated assets
and do not repeat the same products across adjacent sections.

Deterministic SQL generators build customer and business histories around the
catalog and Algerian geography. They populate fulfillment, finance, acquisition,
catalog intelligence, customer reporting, action history, and assistant analytics
together. Importing an unrelated order dataset would not establish those
relationships.

### What building the demo exposed

Early data produced contradictions visible in the charts: substantial order
volume with almost no paid outcomes, implausible repeat-customer rates, and
reporting periods that did not line up. Fixing individual headline values would
have left drill-downs inconsistent. The generators and reporting inputs had to
agree on customer identity, posted transitions, carrier status, attribution,
and paid outcomes.

The review also reached shared analytics behavior. Partial weeks and months
must not look like completed periods collapsing at the end of a chart.
Projections need a distinction between observed results, estimated completion,
and future values. Current
[chart tests](../apps/admin/components/analytics/analytics-workspace.test.tsx)
cover those boundaries; [forecast tests](../apps/admin/lib/analytics.test.ts)
cover completed-day history, weekday variation, backtested baselines, and
resistance to an exceptional day's influence. The formulas and interpretation
belong in [analytics](analytics.md).

## Repeatable state without redoing every step

The source launcher builds and verifies a versioned PostgreSQL template.
Subsequent resets clone a matching template, then add a fresh seven-day activity
window relative to the reset date. A changed dataset, schema, media origin, or
date can require rebuilding the historical template.

Reset also restores mock carrier state, clears Redis and application caches,
removes uploaded demo files, and restores Storefront's writable runtime files.
Generated credentials survive. Downloaded originals stay on the machine for
rebuilds, and curated media is restored from the local cache. Resets stop the
applications while replacing their state, so the hosted demo is briefly
unavailable during that work; a historical rebuild takes longer.

The [release assembler](../ops/demo/release/assemble.mjs) packages application,
initialization, gateway, and media images with the source and asset manifests.
Installation generates fresh credentials and gives applications only their own
runtime configuration. It does not ship the build machine's environment files.

## Hosting a writable public demo

Public developer access is intentional. Visitors can change or delete demo
records, so the installation must be disposable and separated from real data.

Containers have CPU, RAM, process, and log limits. Their long-running processes
use read-only root filesystems with bounded temporary storage. The
[gateway](../ops/demo/gateway/nginx.conf) limits requests and concurrent
connections, applies tighter limits to imports, exports, and uploads, and
rejects oversized bodies. MinIO has a 4 GiB bucket quota. Admin has bucket-scoped
object permissions; the API has read-only access. Neither receives storage root
credentials.

The hosted instance adds controls outside Compose: a firewall blocks new
connections from demo containers to the workstation, LAN, other container
networks, and internet, while a separate 16 GiB filesystem bounds persistent
demo data. Public HTTPS traffic reaches the workstation through a VPS reverse
connection. Only the Storefront, Admin, and intended public media paths are
exposed. Databases, provider mocks, the canonical API, and the storage console
remain private.

Those host controls are not installed by the portable bundle. Loopback port
bindings alone do not isolate containers from a host or LAN. The demo also does
not reproduce production's blue/green deployment or availability guarantees.

## AI assistants

AI assistants are not yet available in the hosted demo. Seeded conversations
and assistant analytics let visitors inspect those interfaces, but do not
represent live model execution.

To try live assistants locally from source, supply your own
`OPENROUTER_API_KEY`, set `AI_PROVIDER=openrouter` and `AI_ENABLED=true`, and
configure the Admin and Storefront models. Enable the shopping assistant in
Storefront settings as well. External DNS is disabled by default, and hardened
hosts also block outbound connections, so a key alone is insufficient. The
[AI setup notes](../ops/demo/release/README.md#ai-assistants) explain the runtime
files and network override. Launcher commands regenerate those environment
files, so keep that in mind when applying local changes.

TODO: add local AI model support to the demo.

## Verification

[Historical assertions](../ops/demo/postgres/seed/99-verify.sql) and
[live-window assertions](../ops/demo/postgres/seed/99-live-verify.sql) check
counts, shipment transitions, supported carrier outcomes, geography, traffic
coverage, and event-to-order relationships before accepting a seed.

The [bundle verification](../ops/demo/release/verify.mjs) checks a fresh install,
local media, credential separation, resource limits, restart preservation, and
resets, including a simulated later-day rebuild. Development of the hosted
demo also included French and Arabic browser checks, developer-session login,
mobile checkout, and direct checks that forbidden network and storage actions
fail.
