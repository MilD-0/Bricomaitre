# Bricomaitre

Bricomaitre is a bespoke production commerce system for one Algerian retail
operation. Its Customer Storefront and Commerce Operating System are equal
parts of the product: one serves product discovery and ordering, while the
other serves the work required to confirm, fulfil, and understand those orders.

## Reference Systems

When comparison is useful, study
[Saleor](https://github.com/saleor/saleor),
[Vendure](https://github.com/vendure-ecommerce/vendure), and
[Medusa](https://github.com/medusajs/medusa). Explore them freely for ideas and
context. Before carrying an idea into Bricomaitre, explain how it informs the
change and why it fits this system; do not import designs or abstractions by
habit.

## What Makes Bricomaitre Different

- This is software for one real operation, not a generic multi-tenant commerce platform..
- The market includes constrained devices and networks, and French and Arabic users.
- The core order workflow is phone-confirmed cash on delivery: call, record
  confirmed/no-answer/cancelled, batch post, and dispatch.
- The absence of online payment is a business licensing constraint, not a
  desired technical limitation.
- Operational fit takes precedence over generic ecommerce abstractions.

## Working With Mild

I'm Mild. I'm a software engineer who likes solving real problems end to end
and understanding the systems I work on.

Start with the problem and work outward. Prefer simple, coherent solutions and
fix root causes rather than symptoms. Cross layers when that is what a complete
solution requires. Complexity should earn its place.

Be high-agency: explore, reason, and make progress without waiting for every
step to be specified. Surface consequential assumptions and tradeoffs early so
I can make the decisions that matter.

- Difficulty or implementation time alone is not a reason to withhold a good
  solution.
- Propose bold ideas when they are genuinely better, and explain why.
- Tests should provide meaningful evidence. Value strong coverage, but avoid
  endless smoke tests, deletion-regression tests, and tests that prove little.
- Add libraries when they materially improve or unlock the solution. Evaluate
  dependencies by maintenance, reputation, quality, security, compatibility,
  and fit—not merely by their names or descriptions.

## Authority And Safety

A question, review request, or diagnosis request is just that.
A direct request to build, fix, or change something authorizes the normal code and production mutations needed to reach that outcome; do not ask again for routine in-scope steps.

Read and investigate freely. Use the local ignored `codexCreds` file when a
task requires production access. Agents may inspect whatever production data
the task requires.

Take a destructive action only when it is clearly entailed by the request, the
exact target and blast radius have been verified, and recovery has been
considered. Otherwise, surface the decision first. If an invariant in this
guide conflicts with the requested outcome, explain the conflict and get
Mild's sign-off before breaking it; strong defaults may yield to better
evidence.

The deepest `AGENTS.md` covering a file adds local rules to this guide. Preserve
user-authored work, inspect the worktree before editing, and do not silently
absorb unrelated cleanup or release work.

## Workspace Map

| Path                        | Package                 | Owns                                                          |
| --------------------------- | ----------------------- | ------------------------------------------------------------- |
| `apps/admin/`               | `@bric/admin`           | Internal UI, privileged APIs, migrations, and background work |
| `apps/storefront-api/`      | `@bric/storefront-api`  | Canonical public catalog and order backend                    |
| `apps/storefront/`          | `@bric/storefront`      | Customer Storefront and its local BFF                         |
| `packages/ai-core/`         | `@bric/ai-core`         | Shared AI contracts and utilities                             |
| `packages/db/`              | `@bric/db`              | Shared Drizzle client and schema exports                      |
| `packages/runtime/`         | `@bric/runtime`         | Shared runtime helpers                                        |
| `packages/storefront-core/` | `@bric/storefront-core` | Shared storefront contracts, authorization, and services      |
| `ops/`                      | `@bric/ops`             | Deployment, release, container, and host tooling              |

Run package scripts with `pnpm --filter <package> <script>`. Shared gates
include `pnpm test:packages`, `pnpm test:ops`, `pnpm lint`, `pnpm typecheck`,
`pnpm format:check`, `pnpm dead-code:check`, and `pnpm test:ci`. Exact app and
operations commands belong in their local guides.

## Before Changing Code

- Read this guide and the deepest applicable guide.
- Inspect the current implementation before designing its replacement.

## Architecture Invariants

- `apps/storefront-api` is the canonical public backend for storefront catalog
  and order flows. `apps/storefront` uses its established client and BFF
  boundary; public business logic does not move into admin-only modules.
- Shared database code belongs in `packages/db`. Established shared storefront
  contracts and services belong in `packages/storefront-core`.
- Create new shared code only when the concept, ownership, lifecycle, and
  reasons to change are genuinely shared. Duplication alone is not sufficient.
- Change all affected consumers with a cross-app contract rather than leaving
  incompatible versions behind.
- Every deployable app keeps a working `GET /api/health` route and verifiable
  release identity.

## Taste

Design the whole workflow coherently rather than polishing isolated screens.
Simplicity means removing unnecessary decisions, not merely hiding complexity.
Dense operational interfaces in admin are acceptable when the density serves real work;
visual clutter is not. Storefront interactions should remain calm, fast,
forgiving, and legible on small devices. Do not preserve accidental complexity
solely because it already exists. Avoid generic template aesthetics and
decorative “AI product” styling.

- Use typography, spacing, alignment, and restrained dividers to establish
  hierarchy before adding containers.
- A card must represent a genuinely contained object or interaction; it is not
  the default section wrapper.
- Do not nest cards, panels, or bordered surfaces merely to create hierarchy.
- Avoid eyebrow headings, ornamental labels, gratuitous pills, excessive
  rounding, decorative gradients, and layer-on-layer framing unless the
  existing context gives them a real purpose.
- Inspect neighboring screens, current components, and shared design tokens
  before changing UI.
- Visually verify meaningful UI changes across the relevant viewport and
  locale rather than judging them from JSX alone.

## Implementation And Verification

Behavior-bearing changes need proportionate evidence, not mechanically a new
test file. Existing tests may be enough when they directly prove the behavior.
Cover meaningful success, failure, and boundary cases at the layer that can
actually establish them. Documentation-only changes do not require application
tests.

Start with the smallest focused check that can fail usefully, then widen to the
owning package, affected cross-package checks, and the full local release gate
before a push or release when warranted. Run a build whenever production output
is the evidence. Finish by inspecting the diff and worktree and report exactly
what was and was not verified.

CI is final verification, not an iterative debugger. Fix deterministic failures
locally first. Reruns are appropriate when a network or other transient failure
is plausible; do not blindly rerun unchanged deterministic failures. Manage and
clean up long-lived processes, and keep expensive work bounded and observable.

## Git And Releases

Commit coherent completed work whenever it improves the repository history;
commits do not require separate permission. Use clear messages that describe
the real change set.

Pushing requires Mild's permission. Once granted, permission for ordinary
pushes persists for the conversation until explicitly revoked.

Complete relevant local gates before pushing, keep pushes coherent, and do not
use empty commits or duplicate workflow runs to make CI retry work it cannot
prove.

## Documentation And Repository Integrity

Use [CONTEXT.md](CONTEXT.md) for canonical domain language. Current system
boundaries live in [architecture](docs/architecture.md), [analytics](docs/analytics.md),
and [AI assistants](docs/ai.md).

`README.md` and project documentation explain what Bricomaitre is and why it
exists. Agent guides contain only facts and instructions needed to change it.
Add routing links as real canonical documents are written rather than pointing
at planned documentation.

Preserve `LICENSE`, `NOTICE`, `SECURITY.md`, and applicable third-party license
texts when changes affect them. Keep excluded assets, secrets, and production
data out of covered or public source.
