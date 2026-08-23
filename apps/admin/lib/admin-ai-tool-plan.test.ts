import { describe, expect, it } from 'vitest';

import { adminAiGroundingTool, adminAiMutationTool } from './admin-ai-tool-plan';

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

  it('resolves products for landing-page creation and complete documents for edits', () => {
    expect(
      adminAiGroundingTool({
        surface: 'assets',
        section: 'landingPages',
        message: 'Crée une landing page pour la perceuse 12.',
        permissions: ['assets_write'],
      }),
    ).toBe('find_products');
    expect(
      adminAiGroundingTool({
        surface: 'assets',
        section: 'landingPages',
        message: 'Réécris le hero de la landing page 41.',
        permissions: ['assets_write'],
      }),
    ).toBe('inspect_landing_pages');
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

  it('reads complete product records before direct commercial edits', () => {
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Change le prix du produit 12 à 14 900 DZD.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_products');
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

describe('admin AI explicit mutation planning', () => {
  it.each([
    ['orders', 'Confirme la commande 91.', ['orders_write'], 'update_order_status'],
    [
      'orders',
      'Corrige la commande 91 : livraison à domicile, wilaya 16.',
      ['orders_write'],
      'update_order_details',
    ],
    ['inventory', 'Ajoute 6 unités à PB-1.', ['products_write'], 'adjust_inventory'],
    ['assets', 'Active le groupe 7 et affiche-le en haut.', ['assets_write'], 'update_asset_state'],
    [
      'assets',
      'Crée un groupe vedette avec les produits 12 et 18.',
      ['assets_write'],
      'manage_assets',
    ],
    [
      'ai_proposals',
      'Vérifie puis approuve la proposition 44.',
      ['products_write'],
      'review_ai_proposals',
    ],
    [
      'administration',
      'Crée le rôle Support avec accès aux commandes.',
      ['settings_manage'],
      'set_role_definition',
    ],
    ['bulletin', 'Réponds au sujet 7 avec ce suivi.', [], 'reply_bulletin_post'],
    ['bulletin', 'Épingle le sujet 7.', [], 'update_bulletin_post'],
    ['bulletin', 'Supprime la réponse 9.', [], 'delete_bulletin_content'],
    ['products', 'Catégorise tout le catalogue.', ['products_write'], 'categorize_catalog'],
    [
      'products',
      'Change le prix du produit 12 à 14 900 DZD.',
      ['products_write'],
      'update_products',
    ],
    [
      'brands_categories',
      'Crée la marque Atelier Pro.',
      ['brands_categories_write'],
      'propose_brand_create',
    ],
  ] as const)(
    'plans one explicit %s mutation after grounding',
    (surface, message, permissions, expected) => {
      expect(adminAiMutationTool({ surface, message, permissions: [...permissions] })).toBe(
        expected,
      );
    },
  );

  it('plans storefront writes from the exact administration section', () => {
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'storefront',
        message: 'Active l’annonce de livraison.',
        permissions: ['settings_manage'],
      }),
    ).toBe('update_storefront_announcement');
  });

  it('plans direct landing-page creation and revision-safe edits', () => {
    expect(
      adminAiMutationTool({
        surface: 'assets',
        section: 'landingPages',
        message: 'Crée une landing page pour la perceuse 12.',
        permissions: ['assets_write'],
      }),
    ).toBe('create_landing_page');
    expect(
      adminAiMutationTool({
        surface: 'assets',
        section: 'landingPages',
        message: 'Réécris le hero de la landing page 41.',
        permissions: ['assets_write'],
      }),
    ).toBe('edit_landing_page');
  });

  it('does not turn informational or unauthorized questions into writes', () => {
    expect(
      adminAiMutationTool({
        surface: 'inventory',
        message: 'Quelles références sont presque épuisées ?',
        permissions: ['products_write'],
      }),
    ).toBeNull();
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Confirme la commande 91.',
        permissions: [],
      }),
    ).toBeNull();
  });
});
