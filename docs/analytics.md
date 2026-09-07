# Analytics

Bricomaitre reporting combines commerce, fulfilment, acquisition, Storefront,
search, catalog, and cost evidence. These sources do not share one natural date
or coverage boundary, so the system keeps their meanings visible instead of
forcing every number into one apparently complete dataset.

## Sources of truth

| Source                           | What it establishes                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Orders                           | Submitted demand, Operational Order Status, captured line prices, discounts, delivery fees, and purchase costs |
| Carrier Shipments                | Posting, delivery, return, payment, COD, provider fees, and Shipment Status                                    |
| First-party Storefront analytics | Sessions, behavior, acquisition, search, assistant influence, errors, and Web Vitals                           |
| Advertising reports              | Spend and delivery reported by each advertising provider                                                       |
| Search Console                   | Finalized organic search and indexation evidence through its own cutoff                                        |
| Governed assumptions             | Planning return rate, DZD/EUR rate, operating costs, and explicit daily overrides                              |

First-party events and durable rollups are the authoritative Storefront record.
Vendor analytics destinations are adapters. Permanent daily facts preserve core
session denominators after detailed event retention ends.

New daily aggregates and live traffic use the Algeria reporting day, matching
Orders. Older aggregates retain their UTC calendar, identified in source metadata.
They cannot support exact Algeria-day comparisons without raw events or a complete
backup; the transition avoids counting events twice.

## Commerce economics

A submitted Order measures incoming demand. Confirmation establishes that the
business accepted the Order for fulfilment. Posting starts the carrier
lifecycle. Delivered and paid outcomes mean different things: delivery is a
Shipment outcome, while paid COD is carrier-recorded settlement evidence.

Order lines capture their commercial facts so later catalog edits do not
rewrite history. Paid contribution uses carrier COD, carrier fees, and the
captured product cost. When an exact cost snapshot is unavailable, reports may
use the fallback margin and expose exact-cost coverage rather than presenting
the estimate as complete.

The planning model is:

```text
ad cost DZD = Meta spend EUR * configured FX rate
adjusted profit = realized contribution
                + unresolved posted contribution * (1 - planning return rate / 100)
net profit = adjusted profit - ad cost
Profit x = adjusted profit / ad cost
true profit = net profit - operating costs
```

A 100% default return rate overrides daily entries and suppresses all derived
profit and profit ratios, including forecasts. A daily 100% override suppresses
only that day's contribution. Gross amounts, costs, cash, and activity stay visible.

The planning return rate applies only to unresolved posted work. Known
successful outcomes retain realized contribution; returned, cancelled, and
failed outcomes contribute zero. Observed mature returns are reported as
evidence but do not silently replace the planning assumption.

A Friday with no automatic or manual gross or confirmed activity
is treated as a rest day: its advertising spend rolls into the next working day
for calculator accounting, while the raw provider date stays unchanged.

The planning CSV counts posted Orders unless a manual daily count overrides them.
Its ratio to Meta purchases can exceed 100% and does not measure confirmation rate.

## Attribution

The first entry into an acquisition session is immutable. At Order submission,
the system records both the submitting session and the most recent non-direct
touch from the previous seven days. This preserves the difference between the
Customer's immediate return path and the source that brought them into the
journey.

Classification uses captured UTM values, click identifiers, and referrer
evidence. It distinguishes paid Meta and Google traffic, organic traffic,
unclassified Meta traffic, direct or dark-social visits, shared links, external
AI referrals, other campaigns and referrals, and unknown evidence. Automated
requests are identified at event intake and are not counted as human sessions.

Campaign, ad-set, and ad reporting is joined to Orders only when exact durable
identifiers exist.

## Reporting workspaces

The Commerce Operating System exposes one query contract across focused
workspaces:

- **Command** summarizes the main operational and commercial signals.
- **Money** owns profit definitions, paid contribution, forecasts, Posting
  cohorts, and Friday accounting.
- **Fulfilment** follows submitted, confirmed, posted, active, delivered, paid,
  returned, and failed populations.
- **Acquisition** covers advertising spend, entities, attribution, and paid
  efficiency.
- **Storefront** covers sessions, funnels, paths, landing pages, onsite search,
  product behavior, errors, and performance.
- **Search** reports Search Console visibility.
- **Catalog** covers products, baskets, Customers, and geography.
- **Assumptions** makes planning returns, FX, costs, and overrides explicit.

Each response carries its requested range, effective source ranges, generation
time, source health, warnings, and diagnostics. The same semantic contract is
available to the operating assistant, which lets it explain where a figure came
from and whether it is measured, modeled, or incomplete.

## Coverage and comparison

- Combined metrics stop at the last date on which every required source is
  complete.
- Change against a prior period is withheld when the two periods are not
  comparable.
- Funnels retain one cohort and date basis across adjacent stages.
- Open periods and recent fulfilment cohorts remain visibly immature;
  actual-to-date, projected completion, and forward forecasts stay separate.
- Paid-Order and paid-unit projections compare periods only when both Posting
  cohorts have at least 95% fact coverage. Paid and delivered outcomes count in
  full, terminal losses count as zero, and unresolved Orders use the configured
  paid-rate assumption. Manually completed Orders contribute to projected
  profit but not projected paid counts.
- Forward economics forecasts use completed days only. The system bounds
  outliers, backtests recent, weekday, and blended baselines, and uses current
  pipeline evidence as a floor.

## Freshness

Workspace reports share cached results and show when they were calculated. After
five minutes, a result can remain visible while its replacement runs. Refresh
requests a new calculation; custom ranges calculate on first request. The worker
prepares common reports in the background, and Redis failure falls back to direct
calculation. Saved costs and assumptions queue durable, retryable fact refreshes.

## Verification

[`apps/admin/lib/analytics.ts`](../apps/admin/lib/analytics.ts) is the public
reporting entry point. Date, economics, forecast, coverage, and workspace logic
live under [`apps/admin/lib/analytics`](../apps/admin/lib/analytics), while
[`profit-tracker.ts`](../apps/admin/lib/profit-tracker.ts) owns the underlying
planning economics. Attribution contracts live in
[`packages/storefront-core`](../packages/storefront-core/src/storefront).

Unit tests cover formulas, dates, classification, and coverage rules. Service
tests establish PostgreSQL materialization and migration behavior; browser
tests establish the workspaces and their exposed states. Production values may
be published separately, but real Customer records and raw production exports
do not belong in repository documentation.
