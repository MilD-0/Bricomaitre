import { describe, expect, it } from 'vitest';

import type { AdminAiSurfaceContext } from './admin-ai-context';
import {
  adminAiAnalyticsPlanMessage,
  applyAdminAiAnalyticsQueryPlan,
  planAdminAiAnalyticsQuery,
} from './admin-ai-analytics-plan';

const analyticsContext: AdminAiSurfaceContext = {
  locale: 'fr',
  surface: 'stats',
  section: 'storefront',
  pathname: '/fr/stats/website',
  hash: null,
  filters: { range: '90d', grain: 'week' },
  selection: null,
};

describe('admin AI Analytics query planning', () => {
  it.each([
    [
      'Le taux de retour observé est-il devenu notre hypothèse de planification ?',
      { view: 'assumptions' },
    ],
    [
      'Une commande livrée affiche zéro tentative de livraison.',
      { view: 'fulfillment', focus: { dimension: 'attempt_outcomes' } },
    ],
    [
      'La courbe pointillée du profit plonge après le 23 août.',
      { view: 'money', focus: { dimension: 'forecast' } },
    ],
    [
      'La position moyenne Search Console passe de 8,4 à 5,2.',
      { view: 'search', focus: { dimension: 'search_trend' } },
    ],
    [
      'Distingue les commandes soumises, livrées et payées.',
      { view: 'fulfillment', focus: { dimension: 'cash_pipeline' } },
    ],
    ['Compare la contribution payée automatique au vrai profit.', { view: 'money' }],
  ] as const)('routes %s through its canonical semantic owner', (message, expected) => {
    expect(planAdminAiAnalyticsQuery({ message, now: new Date('2026-08-23T12:00:00Z') })).toEqual(
      expect.objectContaining(expected),
    );
  });

  it('preserves explicit French dates and preset ranges without model date arithmetic', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Analyse les campagnes du 1er au 23 août 2026.',
        now: new Date('2026-08-23T12:00:00Z'),
      }),
    ).toMatchObject({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
      focus: { dimension: 'campaigns' },
    });
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Analyse précisément la performance du produit 12 sur les 90 derniers jours.',
      }),
    ).toMatchObject({ view: 'catalog', range: '90d', focus: { dimension: 'products' } });
  });

  it('omits focus when comparing headline profit meanings from one Money result', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Compare la contribution payée automatique au vrai profit.',
      }),
    ).not.toHaveProperty('focus');
  });

  it('uses the active workspace and filters for an unspecialized question', () => {
    const plan = planAdminAiAnalyticsQuery({
      message: 'Que s’est-il passé sur cette période ?',
      context: analyticsContext,
    });

    expect(plan).toMatchObject({ view: 'storefront', range: '90d', grain: 'week' });
    expect(adminAiAnalyticsPlanMessage(plan)).toContain('Application-owned canonical');
  });

  it('applies the trusted first-query plan while preserving only compatible entity selectors', () => {
    expect(
      applyAdminAiAnalyticsQueryPlan(
        {
          view: 'acquisition',
          range: '30d',
          startDate: '2025-01-01',
          endDate: '2025-01-30',
          focus: { dimension: 'profit_efficiency', search: 'profit', limit: 50 },
        },
        {
          view: 'money',
          range: '30d',
          maxQueries: 1,
          reason: 'Money owns profit definitions.',
        },
      ),
    ).toEqual({ view: 'money', range: '30d', grain: 'auto' });

    expect(
      applyAdminAiAnalyticsQueryPlan(
        { focus: { dimension: 'ads', search: 'Alpha', identifiers: ['12'], limit: 50 } },
        {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
          focus: { dimension: 'campaigns' },
          maxQueries: 1,
          reason: 'Campaigns own attribution.',
        },
      ),
    ).toEqual({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
      grain: 'auto',
      focus: { dimension: 'campaigns', search: 'Alpha', identifiers: ['12'], limit: 50 },
    });
  });

  it('allows additional canonical reads only for explicitly cross-workspace questions', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Compare Search Console, Meta et les sessions boutique.',
      }),
    ).toMatchObject({ view: 'search', maxQueries: 3 });
    expect(planAdminAiAnalyticsQuery({ message: 'Quel est notre vrai profit ?' })).toMatchObject({
      view: 'money',
      maxQueries: 1,
    });
  });
});
