import type { AdminAiAnalyticsFocusDimension, DatasetSpec } from '../focus-contract';
import { rankedView, seriesView } from './semantics';
export const economicsDatasets = {
  economics_timeline: {
    views: ['command', 'money'],
    paths: { command: ['trajectory'], money: ['series'] },
    effectiveRangeKey: 'economics',
    definition:
      'Observed calculator economics with explicitly separate projected completion fields for open buckets.',
    dateBasis: 'Calculator accounting date led by first-posted orders.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  paid_timeline: {
    views: ['money'],
    paths: { money: ['paidSeries'] },
    effectiveRangeKey: 'paid',
    definition: 'Automatic paid contribution recognized from EcoTrack paid/archive outcomes.',
    dateBasis: 'EcoTrack paid/archive recognition date.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: seriesView,
  },
  cash_pipeline: {
    views: ['command', 'fulfillment'],
    paths: { command: ['fulfillment', 'cashPipeline'], fulfillment: ['cashPipeline'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Submitted, confirmed, posted, active, delivered, paid, and unresolved operational value stages without treating demand as cash.',
    dateBasis: 'Stage-specific lifecycle date over the shared fulfillment range.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
    rowSemantics: {
      submitted: {
        definition: 'Incoming submitted demand still awaiting local confirmation.',
        dateBasis: 'Order-created pending-demand date.',
        sources: ['orders'],
        modeled: false,
      },
      confirmed: {
        definition: 'Locally confirmed demand still awaiting first posting.',
        dateBasis: 'Local confirmation pending-demand date.',
        sources: ['orders'],
        modeled: false,
      },
      inTransit: {
        definition: 'Active EcoTrack shipment after effective-status and stale-failure filtering.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Open operational population, not a terminal outcome.',
      },
      deliveredAwaitingCollection: {
        definition: 'Delivered EcoTrack shipment whose COD has not yet been recorded as collected.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Delivered is not paid cash.',
      },
      collectedAwaitingPayout: {
        definition: 'EcoTrack indicates COD collection but merchant payout is still pending.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
      },
      paymentReady: {
        definition: 'EcoTrack marks the shipment payout as ready but not yet in a paid outcome.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
      },
      paid: {
        definition: 'EcoTrack payed or paye_et_archive outcome; both are legitimate paid outcomes.',
        dateBasis: 'EcoTrack paid/archive recognition date.',
        sources: ['orders', 'ecotrack'],
      },
    },
  },
  forecast: {
    views: ['command', 'money'],
    paths: { command: ['forecast', 'days'], money: ['forecast'] },
    additionalEffectiveRangeKeys: ['fulfillment', 'paid'],
    effectiveRangeKey: 'economics',
    definition:
      'Modeled future economics and first postings from historical and pending-demand evidence, with paid outcomes from recent recognition-day history.',
    dateBasis: 'Future calculator accounting date.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: 'Every row is modeled, not observed.',
  },
  signals: {
    views: ['command'],
    paths: { command: ['signals'] },
    effectiveRangeKey: 'economics',
    definition:
      'Deterministic canonical business signals derived from current metrics and coverage.',
    dateBasis: 'The owning metric date basis.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: rankedView,
  },
  posting_cohorts: {
    views: ['money', 'fulfillment'],
    paths: { money: ['cohorts'], fulfillment: ['cohorts'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Original first-posted cohorts observed through later delivery, return, and payment outcomes.',
    dateBasis: 'Original first-posted date, regardless of later outcome date.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: 'Recent cohorts can be immature and must be labeled with their maturity state.',
  },
  friday_weeks: {
    views: ['money'],
    paths: { money: ['weeks'] },
    effectiveRangeKey: 'economics',
    definition: 'Friday-start calculator weeks after the canonical rest-day roll-forward.',
    dateBasis: 'Friday-start calculator accounting week.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  shipment_states: {
    views: ['fulfillment'],
    paths: { fulfillment: ['states'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Effective EcoTrack shipment states, including explicit untracked and stale filtering.',
    dateBasis: 'First-posted cohort observed through its latest usable EcoTrack state.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  attempt_outcomes: {
    views: ['fulfillment'],
    paths: { fulfillment: ['attempts'] },
    effectiveRangeKey: 'fulfillment',
    definition: 'Recorded EcoTrack delivery-attempt telemetry grouped by outcome.',
    dateBasis: 'First-posted cohort with recorded attempt telemetry.',
    sources: ['orders', 'ecotrack'],
    totalSemantics:
      'Zero recorded attempts can mean missing provider telemetry; it does not prove no attempt occurred.',
  },
  fulfillment_trend: {
    views: ['fulfillment'],
    paths: { fulfillment: ['trend'] },
    effectiveRangeKey: 'fulfillment',
    definition: 'Shipment outcomes over time after effective-status filtering.',
    dateBasis: 'Canonical fulfillment event date declared by each field.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: seriesView,
  },
  leading_forecast: {
    views: ['fulfillment'],
    paths: { fulfillment: ['leadingForecast', 'days'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Known submitted and confirmed demand modeled to first posting, alongside paid outcomes modeled from recent recognition-day history.',
    dateBasis:
      'Future first-posted expectation date for pending demand and future EcoTrack recognition date for paid outcomes.',
    sources: ['orders', 'ecotrack', 'assumptions'],
    totalSemantics: 'Every row is modeled, not observed.',
  },
  operating_costs: {
    views: ['assumptions'],
    paths: { assumptions: ['costs'] },
    effectiveRangeKey: 'assumptions',
    definition: 'Manually configured operating-cost records and their effective periods.',
    dateBasis: 'Configured cost start/end dates.',
    sources: ['assumptions'],
    totalSemantics: rankedView,
  },
  daily_assumptions: {
    views: ['assumptions'],
    paths: { assumptions: ['days'] },
    effectiveRangeKey: 'assumptions',
    definition: 'Daily calculator inputs, source overrides, and resolved assumptions.',
    dateBasis: 'Calculator accounting date.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
} satisfies Partial<Record<AdminAiAnalyticsFocusDimension, DatasetSpec>>;
