# Project story and lineage

## Operating context

The system serves an Algerian retailer that entered an established niche as a
new player. Purchasing power is constrained, cash on delivery is central, and
an order submitted online is only the start of the sale. Staff still need to
contact the Customer, record the result, prepare confirmed Orders, hand them to
a carrier, and follow each Shipment through delivery, return, and payment.

Generic commerce software could display a catalog and collect an order, but it
did not fit this complete loop comfortably. Bricomaitre grew around the
operation instead of making the operation conform to a generic back office.

## Product evolution

The Customer Storefront and Commerce Operating System are equal parts of the
product. The Storefront handles French and Arabic discovery, campaign pages,
checkout, and catalog-grounded assistance. The internal system
handles the work that follows:

```text
call -> mark confirmed/no-answer/cancelled -> batch post
     -> print labels -> dispatch
```

Each addition came from that same operating loop. Confirmation required its own
state and history. Carrier work required Posting previews, labels, Shipment
tracking, and reconciliation. Catalog work expanded into inventory, media,
promotions, feeds, and landing pages. Decisions about acquisition and margin
required first-party analytics with explicit lifecycle and cost semantics. The
assistants arrived later, once the system had enough reliable tools and domain
evidence to make model-led investigation useful.

## Engineering evolution

The early implementations kept the public and internal applications separate.
The current workspace makes that separation explicit: a Customer Storefront, a
canonical Storefront API, and an authenticated Commerce Operating System, with
shared packages only where ownership and lifecycle are shared. See
the [architecture](./architecture.md) for the present boundaries.

Production pressure shaped the rest of the system. Deployments became
digest-pinned blue/green releases with migration, health, and rollback gates.
PostgreSQL became the durable source of truth; Redis took bounded cache, queue,
rate-limit, and idempotency roles. Workers isolated analytics, marketing,
fulfilment, and long-running AI work. Backups, restore drills, observability,
and memory budgets became repository-owned behavior.

The full private history remains a forensic archive.
