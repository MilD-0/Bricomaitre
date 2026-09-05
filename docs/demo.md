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

The hosted demo uses a fixed release checkout and release-specific images,
including its reset scripts and seed data. Development changes do not alter it;
upgrades are deliberate. Downloadable releases pin their images by digest.

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
