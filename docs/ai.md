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

- reads return current evidence without changing state;
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
the latest 200 messages retain full tool evidence, and Admin adds no output-token
cap or evidence truncation. Provider limits still apply. Optional limits and
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

Evaluations exercise real read tools. Mutation tools keep their production
schema and description but return non-writing receipts; Storefront cart changes
remain simulated. This checks whether the model finds and uses the right
evidence without changing production data. The suites judge outcomes and tool
evidence rather than exact wording or one prescribed trajectory.

Shared provider contracts live in [`packages/ai-core`](../packages/ai-core).
The current assistant boundaries are implemented in
[`apps/storefront/lib`](../apps/storefront/lib) and
[`apps/admin/lib`](../apps/admin/lib).
