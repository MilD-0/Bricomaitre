import { ANALYTICS_FACT_SEMANTICS_VERSION } from '../analytics-fact-contract';
import { ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE } from './metrics';

export const ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT = {
  semanticsVersion: ANALYTICS_FACT_SEMANTICS_VERSION,
  timezone: 'Africa/Algiers',
  lifecycle: {
    submitted: 'Incoming storefront order; never call it a completed sale or revenue.',
    confirmed: 'Approved locally; not shipped.',
    posted: 'First local status 11; begins shipment economics.',
    inTransit: 'Active EcoTrack shipment after effective-status filtering.',
    delivered: 'EcoTrack delivery; not proof that COD was received.',
    payed:
      'EcoTrack recognized paid outcome used by Analytics; it is settlement evidence, not bank-account reconciliation.',
    payeEtArchive:
      'Later EcoTrack paid processing/archive outcome; payed remains an equally valid paid outcome.',
    returned: 'Historical terminal outcome; never silently changes the planning return rate.',
    failed:
      'Local failure or prete_a_expedier with no progress for seven days; excluded from active shipment and cash totals.',
    untracked: 'Posted locally with no usable EcoTrack state; qualify it as untracked.',
    deliveryAttempts:
      'A delivered order with zero recorded attempts means attempt telemetry is absent, not necessarily that no attempt happened.',
  },
  profit: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE,
  returnPolicy: {
    planning:
      'Manual rate used only for unresolved demand; exactly 100% is the operator profit-suppression mode.',
    observed:
      'Returned divided by paid plus returned in a mature terminal cohort; excludes active, unresolved, failed, and cancelled orders.',
    adoption:
      'Observed returns are descriptive evidence with sample size and maturity. They change planning only through an explicit user action.',
  },
  missingCosts:
    'Prefer immutable line-item purchase-cost snapshots. Uncovered economics use a 30% estimated margin while exact-cost coverage remains separate. Coverage of at least 95% is not itself a warning.',
  dateBases:
    'Demand uses order-created date; projected economics first-posted/calculator date; delivery the delivery event; maturity the original posting cohort; paid economics paid/archive recognition; Meta its reporting date; Search Console its finalized date. Historical Storefront rollups have a UTC-day boundary limitation near midnight.',
  fridayAccounting:
    'After activation, a Friday with no automatic or manual gross-profit/confirmed activity is a rest day. Actual Meta spend stays on Friday but calculator economics roll it to the next working day. Friday-start weekly totals stay invariant; a trailing Friday may remain pending. Missing order data is never a rest day. No real event timestamp is rewritten.',
  projection:
    'Forecasts backtest weekday and seasonal-blend baselines on completed days, defaulting to the blend with short history. Known pending demand provides a floor, not an addition, with historical conversion/delay, planning returns, and fallback cost. Stale pending demand is capped at seven days. Dotted values are modeled; solid values are observed.',
  sourcePrecedence: {
    demand: 'Bricomaitre orders and immutable lines',
    posting: 'Local status history',
    shipmentAndCod: 'EcoTrack',
    assumptions: 'Manual planning settings',
    ads: 'meta_ads_daily_insights',
    storefront: 'First-party Storefront telemetry',
    organicSearch: 'Search Console',
    spreadsheets: 'Optional historical audit only; never current Meta truth',
  },
  availability:
    'Cross-source claims use the shared effective period. Missing tails, nulls, em dashes, immature cohorts, and unavailable comparisons are never zero. Never compare a complete period with a partial period.',
  storefront:
    'Conversion is submitted local orders divided by canonical first-party sessions. The funnel is distinct sessions → product-view sessions → cart sessions → checkout sessions → submitted-order sessions, never raw event counts.',
  metaAttribution:
    'Keep Meta-reported purchases separate from Bricomaitre orders. Exact retained entity attribution starts around 2026-08-10 and immutable capture on 2026-08-17. Never fabricate earlier attribution. Spend coverage can exceed attributed-order coverage. Creative metrics are diagnostic correlations, not causal proof.',
  interpretation:
    'Customer identity is normalized primarily by phone. Product scatter and tables are filtered decision views; use headline aggregates for totals. Delivery speed is elapsed calendar time. Meta regions and customer wilayas are separate aggregates. Search Console is aggregate and row-limited, lower average position is better, and it does not provide deterministic order attribution. GA4 is not canonical or required.',
  materializedFacts: `Facts are a performance cache, not alternative semantics. Use requires a complete date spine, semantics version ${ANALYTICS_FACT_SEMANTICS_VERSION}, fresh dependencies and assumptions, and no unresolved Friday roll-forward; otherwise canonical tables are computed live.`,
} as const;
