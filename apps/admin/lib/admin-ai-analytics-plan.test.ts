import { describe, expect, it } from 'vitest';

import type { AdminAiSurfaceContext } from './admin-ai-context';
import {
  adminAiAnalyticsQueriesForPlan,
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

  it('keeps the exact prior dataset, entity, and range for a deictic follow-up', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Pourquoi a-t-elle baissé ?',
        previous: {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
          grain: 'day',
          focus: {
            dimension: 'campaigns',
            search: 'Alpha',
            identifiers: ['cmp-1'],
            limit: 20,
          },
        },
      }),
    ).toMatchObject({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
      grain: 'day',
      focus: {
        dimension: 'campaigns',
        search: 'Alpha',
        identifiers: ['cmp-1'],
      },
      reason: expect.stringContaining('conversational follow-up'),
    });
  });

  it('applies an explicit follow-up period while preserving the prior entity', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Et le mois dernier ?',
        now: new Date('2026-08-23T12:00:00Z'),
        previous: {
          view: 'catalog',
          range: '30d',
          focus: { dimension: 'products', identifiers: ['12'] },
        },
      }),
    ).toMatchObject({
      view: 'catalog',
      range: 'custom',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      focus: { dimension: 'products', identifiers: ['12'] },
    });
  });

  it('lets an explicit new breakdown replace the prior focus within the same workspace', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Break that down by ad set.',
        previous: {
          view: 'acquisition',
          range: '30d',
          focus: { dimension: 'campaigns', identifiers: ['cmp-1'] },
        },
      }),
    ).toMatchObject({
      view: 'acquisition',
      focus: { dimension: 'adsets' },
    });
  });

  it('grounds deictic questions in the exact visible analytics selection', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Pourquoi ces campagnes ont-elles baissé ?',
        context: {
          ...analyticsContext,
          section: 'acquisition',
          filters: {
            view: 'acquisition',
            range: '90d',
            grain: 'week',
            analyticsFocus: 'campaigns',
            analyticsIdentifiers: 'cmp-2|cmp-7',
          },
        },
      }),
    ).toMatchObject({
      view: 'acquisition',
      range: '90d',
      focus: { dimension: 'campaigns', identifiers: ['cmp-2', 'cmp-7'] },
    });
  });

  it('does not mistake the current period for the current entity selection', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Résume la performance ce mois-ci.',
        now: new Date('2026-08-23T12:00:00Z'),
        context: {
          ...analyticsContext,
          section: 'acquisition',
          filters: {
            view: 'acquisition',
            range: '90d',
            grain: 'week',
            analyticsFocus: 'campaigns',
            analyticsIdentifiers: 'cmp-2|cmp-7',
          },
        },
      }),
    ).toMatchObject({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
    });
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Résume la performance ce mois-ci.',
        context: {
          ...analyticsContext,
          section: 'acquisition',
          filters: { view: 'acquisition', analyticsFocus: 'campaigns' },
        },
      }),
    ).not.toHaveProperty('focus');
  });

  it('carries selected records into analytics from their native admin surface', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Comment performent ces produits sélectionnés ?',
        context: {
          ...analyticsContext,
          surface: 'products',
          section: null,
          pathname: '/fr/products',
          filters: { range: '30d' },
          selection: { entityType: 'product', ids: [12, 18], focusedId: 18 },
        },
      }),
    ).toMatchObject({
      view: 'catalog',
      focus: { dimension: 'products', identifiers: ['12', '18'] },
    });
  });

  it.each([
    ['Analyse le funnel des sessions boutique.', 'storefront', 'storefront_funnel'],
    [
      'Analyse le funnel des sessions boutique jusqu’à la commande soumise. Est-ce un funnel de ventes payées ?',
      'storefront',
      'storefront_funnel',
    ],
    ['Analyse les parcours Storefront.', 'storefront', 'storefront_paths'],
    ['Montre les problèmes d’indexation Search Console.', 'search', 'search_index_issues'],
    ['Compare les coûts opérationnels.', 'assumptions', 'operating_costs'],
    ['Ajoute un coût mensuel Entrepôt.', 'assumptions', 'operating_costs'],
    ['Analyse les paires de produits achetés ensemble.', 'catalog', 'basket_pairs'],
    ['Montre la santé du tracking Meta.', 'acquisition', 'tracking_events'],
  ] as const)('maps the modern dataset in %s', (message, view, dimension) => {
    expect(planAdminAiAnalyticsQuery({ message })).toMatchObject({
      view,
      focus: { dimension },
    });
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

    expect(
      applyAdminAiAnalyticsQueryPlan(
        {
          focus: {
            dimension: 'paid_funnel',
            search: 'impressions Meta commandes Bricomaitre payées',
            identifiers: ['paid'],
            limit: 50,
          },
        },
        {
          view: 'acquisition',
          range: '30d',
          focus: { dimension: 'paid_funnel' },
          maxQueries: 1,
          reason: 'Acquisition owns the paid funnel.',
        },
      ),
    ).toEqual({
      view: 'acquisition',
      range: '30d',
      grain: 'auto',
      focus: { dimension: 'paid_funnel', limit: 50 },
    });
  });

  it('bundles explicitly cross-workspace evidence into one deterministic tool call', () => {
    expect(
      planAdminAiAnalyticsQuery({
        message: 'Compare Search Console, Meta et les sessions boutique.',
      }),
    ).toMatchObject({
      view: 'search',
      maxQueries: 1,
      additionalQueries: [{ view: 'acquisition' }, { view: 'storefront' }],
    });
    expect(planAdminAiAnalyticsQuery({ message: 'Quel est notre vrai profit ?' })).toMatchObject({
      view: 'money',
      maxQueries: 1,
    });
  });

  it('plans profit diagnosis across Money, Acquisition, and Fulfillment without model wandering', () => {
    const plan = planAdminAiAnalyticsQuery({
      message: 'Pourquoi notre vrai profit a-t-il chuté sur les 30 derniers jours ?',
    });

    expect(plan).toMatchObject({
      view: 'money',
      range: '30d',
      maxQueries: 1,
      additionalQueries: [{ view: 'acquisition' }, { view: 'fulfillment' }],
    });
    expect(adminAiAnalyticsQueriesForPlan({ view: 'command', range: '7d' }, plan)).toEqual([
      { view: 'money', range: '30d', grain: 'auto' },
      { view: 'acquisition', range: '30d', grain: 'auto' },
      { view: 'fulfillment', range: '30d', grain: 'auto' },
    ]);
  });
});
