# Testing

Bricomaitre treats tests as evidence for behavior and release safety. A change
needs the smallest layer that can prove its claim, followed by wider checks in
proportion to the affected boundary. A new test file is not mandatory when an
existing test already establishes the behavior.

## Test layers

| Project                       | Runtime                  | What it proves                                                                 |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `unit-node`                   | Node.js                  | Schemas, calculations, transformations, and server helpers                     |
| `browser-unit-jsdom`          | JSDOM                    | Browser-global helpers without React rendering                                 |
| `component-jsdom`             | JSDOM                    | React rendering, accessible semantics, and interaction                         |
| `route-contract-node`         | Node.js                  | Route validation, authorization, responses, and failures                       |
| `app-contract-node`           | Node.js                  | Storefront pages, BFF routes, metadata, and composition                        |
| `component-integration-jsdom` | JSDOM                    | Behavior spanning interactive components                                       |
| `redis-integration-node`      | Redis                    | AI queue and worker behavior that depends on Redis                             |
| `service-integration-node`    | PostgreSQL and Redis     | Migrations, transactions, persistence, idempotency, and real-service contracts |
| `ops-contract-node`           | Node.js and subprocesses | Release scripts, Nginx, containers, backups, manifests, and smoke behavior     |
| Playwright acceptance         | Chromium                 | Critical localized workflows and responsive behavior                           |
| Playwright performance        | Throttled Chromium       | Storefront budgets on the weak-phone critical path                             |

Small tests stay beside their source as `*.test.ts` or `*.test.tsx`. Route and
application contracts use `*.integration.test.*`; the configured Vitest project
determines their runtime. Shared fixtures and setup belong under each app's
`test/` directory. Storefront browser and performance journeys live under
`apps/storefront/tests/`; Admin browser journeys live under
`apps/admin/tests/browser/`; operational contracts live in `ops/tests/`.

## Browser coverage

Playwright covers Storefront catalog, product, checkout, tracking, landing-page,
and assistant journeys at desktop and representative iPhone and Android
viewports. Admin coverage exercises authenticated workspaces and consequential
operator flows against disposable PostgreSQL and Redis services.

Browser tests use visible roles and user-facing outcomes wherever possible.
They cover French and Arabic behavior, genuine RTL, responsive layout,
accessibility, failure states, and unexpected console errors. Geometry or
runtime instrumentation is used only when layout or performance is the behavior
under test.

Performance tests are separate from acceptance tests. CI runs documented lab
budgets against a production standalone Storefront under throttled Chromium;
field Web Vitals remain the source of truth for the real population. Retries may
expose browser instability, but `failOnFlakyTests` prevents a flaky test from
becoming a passing gate.

Design-baseline captures are opt-in tools, not acceptance tests. Set
`BRIC_UI_BASELINE_DIR` to a writable output directory and run
`pnpm --filter @bric/storefront capture:design-baseline` or
`pnpm --filter @bric/admin capture:design-baseline`. The normal browser commands
do not collect these captures.

## Continuous integration

The CI workflow keeps failures attributable by separating:

- formatting, lint, types, dead-code analysis, operational validation, current-tree plus reachable-history secret scanning
- shared-package and operations contracts
- Admin, Storefront API, and Storefront test suites
- PostgreSQL and Redis service contracts with migrations and schema checks
- Storefront and Admin browser acceptance
- Storefront performance budgets

The final `CI / Required` job reports one stable branch gate. Admin unit and
route-contract suites remain sequential because they share assumptions that
make concurrent execution misleading. Vitest is capped at two workers so
parallel CI lanes do not each expand to the host CPU count. Browser and
performance lanes run after setup in a loopback-only network namespace, while
real-service fixtures use pinned local container images.
