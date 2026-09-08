# AI assistants

Bricomaitre has two assistants with different users and authority. They share
model configuration, telemetry, and a design rule: the model decides how to
investigate, while application code controls what is true and what may change.

| Assistant  | User     | Role                                                                                                              |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Storefront | Customer | Find and compare products, explain delivery and promotions, manage the current cart, and interpret a linked Order |
| Operating  | Operator | Investigate the business, prepare work, and use permission-scoped tools across Admin                              |

## Shared doctrine

The model owns interpretation, investigation, tool selection, evidence
synthesis, and the final explanation. Code owns authentication, authorization,
input validation, business invariants, effects, idempotency, and recovery.

This avoids encoding a brittle decision tree for every plausible request. The
model can decide which evidence matters and follow an unexpected line of
investigation; it cannot bypass the application's rules. Deterministic
orchestration is added only when an observed failure justifies a narrow
constraint. Better source data and better tools are preferred to prompt rules
that imitate application logic.

Conversation history, page context, retrieved guidance, and tool output are
treated as evidence, not instructions. An answer must reconcile claims about a
completed action with the saved tool result, and material uncertainty remains
visible.

## Storefront assistant

The Storefront assistant receives the Customer's locale and bounded page
context, including the current product, landing page, cart, or signed Order
when one is available. Its tools can:

- search the catalog and inspect current product details;
- compare selected products and return product cards;
- look up destination support and delivery fees;
- validate a promotion against the relevant product;
- add, update, or remove items in the current cart; and
- explain the current state of an Order reached through its access token.

Prices, stock, delivery availability, fees, promotions, and Order state come
from typed Storefront contracts. The assistant may explain those facts, but it
may not invent or override them. It answers in French or Arabic. Linked-Order
tools omit contact details, addresses, internal notes, and the access token from
their output.

## Operating assistant

The operating assistant is a durable conversation embedded in Admin. It can
combine live application evidence across analytics, Orders, Shipments,
inventory, products, taxonomy, media, landing pages, Storefront settings, and
background jobs. Page context helps it retain the Operator's selected entity or
filters without silently widening the task.

Its tool surface is built from the signed-in Operator's permissions. A missing
permission removes the corresponding tools; every call still passes through
the same RBAC, schema validation, service, and audit boundaries as a direct UI
action.

The tools distinguish four kinds of work:

- reads return application evidence; live carrier inspection can refresh and
  persist shipment evidence, while stored-order inspection does not refresh it;
- previews establish the exact cohort or proposed effect before a dependent
  action;
- direct mutations use canonical application services and return persisted
  outcomes; and
- long operations enter BullMQ and report queued, running, completed, failed,
  or cancelled state back to the conversation.

Generative changes to product content, categorization, and relationships are
stored as proposals. A proposal records its source state, evidence, confidence,
expiry, and review outcome. Applying it rechecks the live record; changed or
insufficient evidence leaves the proposal unapplied instead of forcing stale
output into the catalog. Work may be configured for automatic review, but it
uses the same verification path.

## Conversations and evidence

Admin conversations and messages persist intentionally so an Operator can
resume an investigation and inspect what supported an earlier answer. By default,
the latest 200 messages retain tool evidence. Production and demo installations
use the [Admin limits profile](../ops/env/admin-ai-limits.env): 16 steps, 3,200 output
tokens, a 60-second request timeout, and bounded context, evidence, and analytics
payloads. Production applies this profile during deployment; demos apply it during
configuration, before any local AI overrides. Provider limits still apply. Optional limits and
provider settings live in the [Admin](../apps/admin/.env.example) and
[Storefront](../apps/storefront/.env.example) environment examples.

Recorded runs identify the surface, task, model, prompt version, actor, status,
timing, and token usage. Tool calls keep their inputs, outputs, status, and
errors. This supports operational debugging and reporting for completion,
latency, tool reliability, usage, and estimated model cost. Proposal and
mutation records remain separate from prose, so the durable application result
is authoritative when narration fails.

## Evaluation

The repository contains outcome-oriented evaluation suites for both
assistants. Storefront scenarios cover recommendations, uncertain
compatibility, French and Arabic behavior, delivery, promotions, linked Orders,
and multi-turn cart changes. Admin scenarios cover workflow knowledge, live
counts, exact entity inspection, analytics interpretation, cross-domain
investigation, follow-ups, and mutations.

Run the full Admin matrix from `apps/admin` with
`pnpm exec tsx scripts/ai-eval-sandbox.ts all`. A suite name and optional scenario
ID or comma-separated IDs select a smaller run. It copies the loopback database configured in the project
environment, adds known test records, and starts private Redis and provider
simulators. The original database and existing services stay untouched.
The disposable copy starts with fresh picking drafts and known orders with status history.

The matrix executes real tool implementations, database mutations, and job
handlers. SQL read-back records changes independently of tool receipts. Carrier,
Meta, and Search Console requests use local HTTP simulators; content-generation
providers use controlled responses. Export files are saved locally, and cache
invalidation is simulated. Those boundaries do not establish live-provider or
generated-copy quality. Storefront cart evaluations remain simulated.

The launcher requires Docker and local database create/drop privileges. It removes
its disposable database and Redis container after the run; private evidence and
the source dump remain in the printed temporary directory. These artifacts can
contain customer data and must not be committed or published.

Admin eval turns use the live step, output-token, request-timeout, retry, and
conversation-evidence limits from the project environment. Analytics tools retain
their configured data limits. The eval has no separate synthesis pass, so the
synthesis-evidence limit applies only to live response recovery.
Set `ADMIN_AI_EVAL_EFFORT=high` to retry at high effort; the default is medium.
Each completed turn records its model and effort.
`ADMIN_AI_EVAL_HIGH_SCENARIOS` accepts comma-separated scenario IDs for high-effort
exceptions. Set `ADMIN_AI_EVAL_SOURCE=demo` to copy the running Docker demo into
the local disposable database. The demo barcode prompt uses its actual product
barcode. Large order tables retain full write-target rows plus fingerprints for
other rows, so unexpected changes outside the selected orders remain visible.

The Admin `workflows` suite adds ordinary operator requests for catalog upkeep,
receiving, order handling, carrier work, reporting settings, and job progress.
Together with the existing suites, its coverage expectations name every registered
tool; a registry test catches new tools without a scenario. Expectations are not
sent to the model. The older `run-ai-evals.ts` command is a read-only dry run:
its mutations still return non-writing receipts and carrier inspection uses
stored evidence without refreshing it.

Each scenario's last log row includes returned tools, dry-run tools, and missing
expected tools. Missing data or a blocked follow-up does not count as coverage.
A returned tool result is not a success verdict. Judge the requested outcome,
saved state, and answer as an operator, allowing recovery from intermediate tool
errors. Scenario reports include write checks, row changes, job results, and a
pending operator verdict. `coverage.json` lists tools not reached in the run;
process completion alone does not establish satisfactory outcomes or full coverage.

Shared provider contracts live in [`packages/ai-core`](../packages/ai-core).
The current assistant boundaries are implemented in
[`apps/storefront/lib`](../apps/storefront/lib) and
[`apps/admin/lib`](../apps/admin/lib).
