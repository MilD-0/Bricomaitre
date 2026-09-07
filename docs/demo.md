# Demo

The demo runs the real applications and workers against synthetic commerce data.
Try ordering, confirmation, fulfilment, catalog editing, and reporting.

[Storefront](https://bricomaitre.mildsauce.cloud) ·
[Admin](https://bricomaitre-admin.mildsauce.cloud)

The hosted instance runs on my own machine and may be slow or offline.
[Email me](mailto:mayldsauce@gmail.com) to arrange access. Visitor data is shared
and resets every six hours. It uses a fixed release, with no production data or
credentials.

## Run it locally

The Docker-only installation bundle attached to a demo release pulls prebuilt
application and media images. It needs Docker with Compose, but no Node.js
installation, source checkout, or external accounts. Extract it and run:

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

Source setup prepares catalog images, builds the apps, and initializes the
database; the bundle includes prepared images. First startup can take several
minutes. For bundle progress, use `docker compose logs -f dataset`.

Open the Storefront at <http://127.0.0.1:3402> and Admin at
<http://127.0.0.1:3400>. Click **Enter the demo** to create a real local session
with developer permissions through the normal session system.

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

The bundle runs Linux containers on Docker Engine or Docker Desktop. Allocate
4 GB of memory and 20 GB of free disk space. Keep ports 3400, 3401, 3402, 3808,
3900, and 3901 available. All published ports bind to the host loopback
interface.

Use `docker compose stop` and `docker compose start` to pause and resume a
bundle installation. `docker compose down` preserves its data volumes. To
discard the installation and its data, run:

```sh
docker compose down --volumes
```

<details>
<summary>Reset a bundle installation</summary>

The bundle has no automatic reset scheduler. Restore its original data with:

```sh
docker compose stop storefront admin admin-worker storefront-api storefront-marketing-worker
docker compose run --rm --no-deps dataset reset
docker compose run --rm --no-deps media reset
docker compose run --rm --no-deps cache-reset
docker compose run --rm --no-deps storefront-runtime reset
docker compose restart mock-services
docker compose up -d --wait --no-deps mock-services
docker compose run --rm --no-deps mock-state
docker compose start storefront-api storefront-marketing-worker admin admin-worker storefront
```

This deletes demo edits, uploads, and queued work, but retains generated
credentials. Use `docker compose ps -a` and `docker compose logs` to investigate
startup failures.

</details>

The [Compose stack](../ops/demo/compose.yml) includes all apps and workers,
PostgreSQL, Redis, and MinIO storage. Local substitutes handle authentication,
carriers, and marketing providers, so demo activity cannot post real shipments
or conversions. They support repeatable failure scenarios, but do not prove
compatibility with every live provider response.

The baseline after a reset contains:

| Data                     |     Count |
| ------------------------ | --------: |
| Products                 |     3,884 |
| Exact-product images     |     9,065 |
| Orders                   |   250,800 |
| Order line items         | 1,003,200 |
| Carrier shipment records |   200,888 |

Reporting spans more than four years, with rollups representing 12 million
synthetic sessions and 72 million events. A recent seven-day window retains
68,400 sessions and 410,400 raw events. These are generated data, not production
traffic or throughput benchmarks.

## AI assistants

Hosted assistants run on a best-effort basis. Resets clear chat history; seeded
AI statistics are synthetic, while new conversations use live models.

Local AI starts disabled. For a source installation, copy the needed provider
settings from the
[Admin environment example](../apps/admin/.env.example) into ignored
`ops/demo/.runtime/ai.env`. For ExperientialLabs or OpenRouter, set
`BRIC_DEMO_AI_RELAY=true` in `ops/demo/.runtime/host.env` and run `./demo up`.
The relay allows only those providers' inference requests; other providers need
their own network configuration. These files survive resets.

For a publicly hosted source installation, set
`BRIC_DEMO_ADMIN_ORIGIN`, `BRIC_DEMO_STOREFRONT_ORIGIN`, and
`BRIC_DEMO_OBJECT_ORIGIN` in `ops/demo/.runtime/host.env` to the public HTTPS
origins served by the reverse proxy. Keep the internal APIs, databases,
provider substitutes, and storage console private. Public Admin access is
intentional, so never connect production credentials or business data.

## Verification

[Historical assertions](../ops/demo/postgres/seed/99-verify.sql) and
[live-window assertions](../ops/demo/postgres/seed/99-live-verify.sql) check
counts, shipment transitions, supported carrier outcomes, geography, traffic
coverage, and event-to-order relationships before accepting a seed.

The [bundle verification](../ops/demo/release/verify.mjs) checks a fresh install,
local media, credential separation, resource limits, restart preservation, and
resets, including a simulated later-day rebuild. Hosted-demo verification also
included French and Arabic browser checks, login, and mobile checkout.
