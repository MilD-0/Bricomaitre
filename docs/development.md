# Task environments and verification

`./bric` runs the current worktree's three apps and workers with local PostgreSQL,
Redis, object storage, carrier mocks, and a small synthetic dataset.

## Start a task

Use Linux, Node 24+, the pinned pnpm version, and Docker Compose. Allow roughly
10 GB of RAM for Node processes, plus Docker and browser overhead. From a clean
checkout, create a worktree with `./bric worktree create checkout-recovery`, then
run inside it:

```sh
pnpm install --frozen-lockfile
pnpm --filter @bric/ops exec playwright install chromium
./bric doctor
./bric env up
./bric env status
```

Startup generates local credentials and refuses root/app `.env` files. Do not copy
production environments into the worktree. Each worktree has isolated ports and
data; use the URLs printed by `env status`. Apps and workers run from source.

Startup applies migrations and seeds products, French and Arabic campaigns,
delivery locations, and synthetic accounts. Fixture changes require a reset.

```sh
./bric env stop     # stop processes and dependencies; preserve data
./bric env up       # restart against current source
./bric env reset    # delete task data and recreate the fixture
./bric env destroy  # remove task containers/volumes and release ports
```

Run `env destroy` before removing a worktree. Logs and evidence stay under ignored
`ops/runtime/dev/`. After a hard kill, inspect the PID in `operation.lock` before
removing a stale lock.

## Choose evidence for the change

```sh
./bric verify --plan
./bric verify
./bric verify --base main --plan
./bric verify --base main
./bric verify -- pnpm test:services
./bric verify -- pnpm build:verify
./bric qa
```

The default comparison is HEAD, including staged, unstaged, and untracked files.
Use `--base` for committed work. Review the selected checks against the behavior
you changed. Browser, service, performance, and production-build checks remain
explicit. Custom commands do not inherit service credentials or automatically
target the task database.

Stop the task environment before builds or browser suites that manage their own
Next output and ports. Restart it before QA and after source edits.

Verification saves commands, logs, results, and source fingerprints in an evidence
directory. A failure stops the run; editing source invalidates a passing result.
Each command has a 15-minute limit, so record longer gates as separate lanes.

`qa` exercises French mobile checkout, loses the response after the Order commits,
and proves recovery creates no duplicate. It then confirms and posts the Order
through Admin and the worker, checking persisted totals and tracking. Traces,
screenshots, request IDs, provider records, and job results remain for inspection.
QA leaves synthetic Orders behind; reset when needed. Arabic, Admin button flows,
performance, live providers, and production builds need their dedicated checks.

## Diagnose across layers

```sh
./bric logs api 100
./bric logs admin-worker 200
./bric inspect order 1
./bric inspect job admin-order-ecotrack JOB_ID
./bric inspect providers
./bric db 'SELECT id, confirmed, total_amount FROM orders ORDER BY id DESC LIMIT 10'
```

Logs are bounded; SQL is read-only with a five-second limit. Use QA's
`requests.json` to correlate service logs and open `trace.zip` in Playwright.
Runtime evidence contains local credentials and authenticated sessions; keep it
out of public artifacts. See `./bric --help` for command options.

Use the [demo](demo.md) for large datasets, [operations](operations.md) for releases
and production diagnosis, and [testing](testing.md) for suite boundaries. Establish
the deployed release and relevant request/job IDs before diagnosing production.

`pnpm dead-code:check` scans dependencies and production reachability. Keep
`knip.json` aligned with executable entry points; test imports alone do not justify
keeping application code.
