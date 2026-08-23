import { describe, expect, it } from 'vitest';

import { adminAiGroundingTool } from './admin-ai-tool-plan';

describe('admin AI first-step grounding', () => {
  it.each([
    ['analytics', 'Compare le revenu par canal.', ['analytics_manage'], 'query_analytics'],
    ['orders', 'Quels clients attendent confirmation ?', ['orders_write'], 'inspect_orders'],
    ['inventory', 'Ajoute 6 unités à PB-1.', ['products_write'], 'inspect_inventory'],
    ['assets', 'Quelles images manquent ?', ['assets_write'], 'inspect_assets'],
    [
      'ai_proposals',
      'Résume les propositions en attente.',
      ['assets_write'],
      'inspect_ai_proposals',
    ],
    ['bulletin', 'Quels sujets demandent une réponse ?', [], 'inspect_bulletin'],
  ] as const)(
    'grounds %s questions in the canonical reader',
    (surface, message, permissions, expected) => {
      expect(adminAiGroundingTool({ surface, message, permissions: [...permissions] })).toBe(
        expected,
      );
    },
  );

  it('reads storefront state before a requested administration mutation', () => {
    expect(
      adminAiGroundingTool({
        surface: 'administration',
        section: 'storefront',
        message: 'Active l’annonce de livraison.',
        permissions: ['settings_manage'],
      }),
    ).toBe('inspect_storefront_configuration');
  });

  it('routes background progress ahead of the current product surface', () => {
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Où en est mon dernier export produits ?',
        permissions: ['products_write'],
      }),
    ).toBe('list_background_jobs');
  });

  it('does not force data access for help or without the domain permission', () => {
    expect(
      adminAiGroundingTool({
        surface: 'analytics',
        message: 'Que peux-tu faire ici ?',
        permissions: ['analytics_manage'],
      }),
    ).toBeNull();
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Résume les commandes.',
        permissions: [],
      }),
    ).toBeNull();
  });
});
