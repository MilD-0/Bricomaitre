import type { AdminAiAnalyticsFocusDimension, DatasetSpec } from '../focus-contract';
import { rankedView, seriesView } from './semantics';
export const acquisitionDatasets = {
  campaigns: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'campaigns'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta campaign performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'campaigns'] },
    relatedDefinition: 'Daily canonical series for the matched campaign identifiers.',
  },
  adsets: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'adsets'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad-set performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'adsets'] },
    relatedDefinition: 'Daily canonical series for the matched ad-set identifiers.',
  },
  ads: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'ads'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'ads'] },
    relatedDefinition: 'Daily canonical series for the matched ad identifiers.',
  },
  attribution_maturation: {
    views: ['acquisition'],
    paths: { acquisition: ['breakdowns', 'maturation'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Captured Meta entity cohorts and their observed Bricomaitre outcome maturation.',
    dateBasis: 'Captured order attribution date with later outcomes observed.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics:
      'A missing campaign means exact first-party attribution is unavailable for that cohort, not that the campaign did not run.',
  },
  meta_daily: {
    views: ['acquisition'],
    paths: { acquisition: ['daily'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta CPM and outbound CTR diagnostics by reporting day.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics: seriesView,
  },
  profit_efficiency: {
    views: ['acquisition'],
    paths: { acquisition: ['profitSeries'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Observed and modeled Profit × without blending the two series.',
    dateBasis: 'Calculator accounting bucket over the shared acquisition range.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  paid_funnel: {
    views: ['acquisition'],
    paths: { acquisition: ['funnel'] },
    effectiveRangeKey: 'acquisition',
    definition:
      'Separate Meta exposure, Bricomaitre demand, local posting, and EcoTrack paid stages.',
    dateBasis: 'Stage-specific date over the shared acquisition range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: 'Stages are not interchangeable and later stages can be immature.',
    rowSemantics: {
      impressions: {
        definition: 'Impressions reported by Meta; not Bricomaitre orders.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      outboundClicks: {
        definition: 'Outbound clicks reported by Meta.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      landingViews: {
        definition: 'Landing-page views reported by Meta.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      bricOrders: {
        definition: 'Exactly captured Bricomaitre submitted orders; demand, not paid sales.',
        dateBasis: 'Captured order-attribution date.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      confirmed: {
        definition: 'Exactly attributed orders later confirmed locally; not shipped.',
        dateBasis: 'Captured order-attribution cohort with later local confirmation observed.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      posted: {
        definition: 'Exactly attributed orders later reaching their first local status 11.',
        dateBasis: 'Captured order-attribution cohort with later first-posted outcome observed.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      paid: {
        definition: 'Exactly attributed orders later reaching EcoTrack payed or paye_et_archive.',
        dateBasis: 'Captured order-attribution cohort with later paid outcome observed.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Recent attributed cohorts can still be awaiting terminal outcomes.',
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
    },
  },
  tracking_events: {
    views: ['acquisition'],
    paths: { acquisition: ['trackingHealth', 'events'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Captured Meta tracking-event diagnostics.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics: rankedView,
  },
} satisfies Partial<Record<AdminAiAnalyticsFocusDimension, DatasetSpec>>;
