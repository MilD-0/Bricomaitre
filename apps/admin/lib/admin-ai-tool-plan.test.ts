import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
  adminAiGroundingTool,
  adminAiMutationTool,
  adminAiRequestTimeoutMs,
  adminAiStepPlan,
} from './admin-ai-tool-plan';

describe('admin AI model-loop planning', () => {
  it('keeps ordinary requests bounded while allowing staged landing-page work to finish', () => {
    expect(adminAiRequestTimeoutMs(30_000, 'update_order_status')).toBe(30_000);
    expect(adminAiRequestTimeoutMs(30_000, 'create_landing_page')).toBe(
      ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
    );
    expect(adminAiRequestTimeoutMs(30_000, 'edit_landing_page')).toBe(
      ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
    );
    expect(adminAiRequestTimeoutMs(30_000, 'sync_analytics_source')).toBe(
      ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
    );
    expect(adminAiRequestTimeoutMs(30_000, 'manage_ecotrack_shipments')).toBe(
      ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
    );
    expect(adminAiRequestTimeoutMs(30_000, null, 'inspect_ecotrack_shipments')).toBe(
      ADMIN_AI_LONG_OPERATION_TIMEOUT_MS,
    );
  });

  it('forces canonical Analytics first, isolates later Analytics work, and bounds cross-view plans', () => {
    expect(
      adminAiStepPlan({ stepNumber: 0, groundingTool: 'query_analytics', mutationTool: null }),
    ).toEqual({ kind: 'force_tool', toolName: 'query_analytics' });
    expect(
      adminAiStepPlan({
        stepNumber: 1,
        groundingTool: 'query_analytics',
        mutationTool: null,
        analyticsQueryCount: 1,
        analyticsQueryLimit: 3,
      }),
    ).toEqual({ kind: 'analytics_only' });
    expect(
      adminAiStepPlan({
        stepNumber: 1,
        groundingTool: 'query_analytics',
        mutationTool: null,
        analyticsQueryCount: 1,
        analyticsQueryLimit: 1,
      }),
    ).toEqual({ kind: 'answer_only' });
    expect(
      adminAiStepPlan({
        stepNumber: 1,
        groundingTool: 'query_analytics',
        mutationTool: 'update_analytics_settings',
        analyticsQueryCount: 1,
        analyticsQueryLimit: 1,
      }),
    ).toEqual({ kind: 'force_tool', toolName: 'update_analytics_settings' });
    expect(
      adminAiStepPlan({
        stepNumber: 2,
        groundingTool: 'query_analytics',
        mutationTool: 'update_analytics_settings',
        analyticsQueryCount: 1,
        analyticsQueryLimit: 1,
      }),
    ).toEqual({ kind: 'answer_only' });
    expect(
      adminAiStepPlan({
        stepNumber: 3,
        groundingTool: 'query_analytics',
        mutationTool: null,
        analyticsQueryCount: 3,
      }),
    ).toEqual({ kind: 'answer_only' });
  });

  it('preserves read-then-write sequencing for explicit operations', () => {
    expect(
      adminAiStepPlan({
        stepNumber: 1,
        groundingTool: 'inspect_orders',
        mutationTool: 'update_order_status',
      }),
    ).toEqual({ kind: 'force_tool', toolName: 'update_order_status' });
  });
});

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

  it('plans exact account revocation without confusing a domain-role edit with deletion', () => {
    expect(
      adminAiGroundingTool({
        surface: 'administration',
        section: 'users',
        message: 'Révoque l’accès de operator@example.com.',
        permissions: ['settings_manage'],
      }),
    ).toBe('inspect_administration');
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'users',
        message: 'Révoque l’accès de operator@example.com.',
        permissions: ['settings_manage'],
      }),
    ).toBe('revoke_access_grants');
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'users',
        message: 'Retire l’accès aux commandes mais garde ce compte.',
        permissions: ['settings_manage'],
      }),
    ).not.toBe('revoke_access_grants');
  });

  it('grounds action-history questions and explicit recovery in the native ledger', () => {
    expect(
      adminAiGroundingTool({
        surface: 'administration',
        section: 'history',
        message: 'Explain the selected action and whether it can be undone.',
        permissions: ['settings_manage'],
      }),
    ).toBe('inspect_action_history');
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'history',
        message: 'Undo action log 44.',
        permissions: ['settings_manage'],
      }),
    ).toBe('recover_action_history');
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'history',
        message: 'Can action log 44 be undone?',
        permissions: ['settings_manage'],
      }),
    ).toBeNull();
    expect(
      adminAiMutationTool({
        surface: 'administration',
        section: 'history',
        message: 'Undo action log 44.',
        permissions: [],
      }),
    ).toBeNull();
  });

  it('previews an ECOTRACK cohort before provider choice and loads requirements for repairs', () => {
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: "Post today's confirmed orders to ECOTRACK.",
        permissions: ['orders_write'],
      }),
    ).toBe('preview_ecotrack_posting');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Corrige les commandes rejetées par Delivro.',
        permissions: ['orders_write'],
      }),
    ).toBe('load_ecotrack_requirements');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Emir',
        permissions: ['orders_write'],
      }),
    ).toBeNull();
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Corrige l’erreur ECOTRACK de la commande 92 : commune Bab Ezzouar.',
        permissions: ['orders_write'],
      }),
    ).toBe('load_ecotrack_requirements');
  });

  it('resolves products before order creation and inspects exact orders before deletion', () => {
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Crée une commande pour Ahmed avec le produit Perceuse Bosch.',
        permissions: ['orders_write'],
      }),
    ).toBe('find_products');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Crée une commande pour Ahmed avec le produit Perceuse Bosch.',
        permissions: ['orders_write'],
      }),
    ).toBe('create_order');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Crée une commande pour Ahmed avec 2 Perceuses Bosch 18 V.',
        permissions: ['orders_write'],
      }),
    ).toBe('find_products');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Supprime la commande 91.',
        permissions: ['orders_write'],
      }),
    ).toBe('inspect_orders');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Supprime la commande 91.',
        permissions: ['orders_write'],
      }),
    ).toBe('delete_orders');
  });

  it('uses native inventory scanner and state workflows instead of generic quantity edits', () => {
    expect(
      adminAiGroundingTool({
        surface: 'inventory',
        message: 'Scanne la commande 50 et remets tous ses produits en stock.',
        permissions: ['products_write'],
      }),
    ).toBe('scan_inventory');
    expect(
      adminAiMutationTool({
        surface: 'inventory',
        message: 'Scanne la commande 50 et remets tous ses produits en stock.',
        permissions: ['products_write'],
      }),
    ).toBe('receive_inventory');
    expect(
      adminAiGroundingTool({
        surface: 'inventory',
        message: 'Remplace le code-barres du marteau par HAM-2026.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_inventory');
    expect(
      adminAiMutationTool({
        surface: 'inventory',
        message: 'Remplace le code-barres du marteau par HAM-2026.',
        permissions: ['products_write'],
      }),
    ).toBe('update_inventory_state');
  });

  it('routes every native storefront setting family through explicit persisted updates', () => {
    for (const message of [
      'Remplace l’adresse de la boutique par 12 rue des Outils.',
      'Efface le lien Facebook de la boutique.',
      'Désactive l’assistant de la boutique.',
      'Change le modèle storefront vers openai/gpt-5.6-luna.',
    ]) {
      expect(
        adminAiGroundingTool({
          surface: 'administration',
          section: 'storefront',
          message,
          permissions: ['settings_manage'],
        }),
      ).toBe('inspect_storefront_configuration');
      expect(
        adminAiMutationTool({
          surface: 'administration',
          section: 'storefront',
          message,
          permissions: ['settings_manage'],
        }),
      ).toBe('update_storefront_settings');
    }
  });

  it('previews shared order shopping lists before saving or applying inventory', () => {
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Prépare la liste d’achat des commandes confirmées.',
        permissions: ['orders_write'],
      }),
    ).toBe('inspect_order_shopping_list');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Prépare la liste d’achat des commandes confirmées.',
        permissions: ['orders_write'],
      }),
    ).toBe('save_order_shopping_list');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Applique au stock toute la liste d’achat des commandes confirmées.',
        permissions: ['orders_write', 'products_write'],
      }),
    ).toBe('apply_order_shopping_list_inventory');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Applique au stock toute la liste d’achat des commandes confirmées.',
        permissions: ['orders_write'],
      }),
    ).toBeNull();
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Montre la liste d’achat partagée des commandes confirmées.',
        permissions: ['orders_write'],
      }),
    ).toBeNull();
  });

  it('uses dedicated preview-first exports and exact tracking-link issuance', () => {
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Exporte toutes les commandes confirmées récentes.',
        permissions: ['orders_write'],
      }),
    ).toBe('preview_order_export');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Exporte toutes les commandes confirmées récentes.',
        permissions: ['orders_write'],
      }),
    ).toBe('start_order_export');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Donne-moi le lien de suivi de la commande 91.',
        permissions: ['orders_write'],
      }),
    ).toBe('inspect_orders');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Donne-moi le lien de suivi de la commande 91.',
        permissions: ['orders_write'],
      }),
    ).toBe('get_order_tracking_links');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Où en est mon dernier export de commandes ?',
        permissions: ['orders_write'],
      }),
    ).toBeNull();
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Où en est mon dernier export de commandes ?',
        permissions: ['orders_write'],
      }),
    ).toBe('list_background_jobs');
  });

  it('inspects Bulletin threads before setting an exact reaction state', () => {
    expect(
      adminAiGroundingTool({
        surface: 'bulletin',
        message: 'Ajoute 👍 au post 7.',
        permissions: [],
      }),
    ).toBe('inspect_bulletin');
    expect(
      adminAiMutationTool({
        surface: 'bulletin',
        message: 'Ajoute 👍 au post 7.',
        permissions: [],
      }),
    ).toBe('set_bulletin_reaction');
  });

  it('grounds native ECOTRACK ledger questions and actions in exact shipment state', () => {
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Montre le suivi et les MAJ des expéditions sélectionnées.',
        permissions: ['orders_write'],
      }),
    ).toBe('inspect_ecotrack_shipments');
    expect(
      adminAiGroundingTool({
        surface: 'orders',
        message: 'Expédie les shipments 91 et 92.',
        permissions: ['orders_write'],
      }),
    ).toBe('inspect_ecotrack_shipments');
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

  it.each([
    [
      'products',
      'Comment performent ces produits sélectionnés ?',
      ['products_write', 'analytics_manage'],
    ],
    [
      'assets',
      'Quel est le taux de conversion de cette landing page ?',
      ['assets_write', 'analytics_manage'],
    ],
    [
      'orders',
      'Compare la tendance des commandes payées et retournées.',
      ['orders_write', 'analytics_manage'],
    ],
    [
      'products',
      'Lance la synchronisation Meta du 2026-08-01 au 2026-08-23.',
      ['analytics_manage'],
    ],
  ] as const)(
    'routes contextual analytics ahead of the %s record reader',
    (surface, message, permissions) => {
      expect(adminAiGroundingTool({ surface, message, permissions: [...permissions] })).toBe(
        'query_analytics',
      );
    },
  );

  it('reads complete product records before direct commercial edits', () => {
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Change le prix du produit 12 à 14 900 DZD.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_products');
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Perform the requested product archive for product 12.',
        permissions: ['products_write', 'analytics_manage'],
      }),
    ).toBe('inspect_products');
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Crée un produit Perceuse compacte à 12 900 DZD.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_products');
    expect(
      adminAiGroundingTool({
        surface: 'products',
        message: 'Archive le produit 12.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_products');
  });

  it('uses the archived catalog reader before an exact product restore', () => {
    expect(
      adminAiGroundingTool({
        surface: 'products',
        section: 'archive',
        message: 'Restaure le produit 12.',
        permissions: ['products_write'],
      }),
    ).toBe('inspect_archived_products');
    expect(
      adminAiMutationTool({
        surface: 'products',
        section: 'archive',
        message: 'Restaure le produit 12.',
        permissions: ['products_write'],
      }),
    ).toBe('restore_products');
    expect(
      adminAiMutationTool({
        surface: 'products',
        section: 'archive',
        message: 'Quels produits archivés puis-je restaurer ?',
        permissions: ['products_write'],
      }),
    ).toBeNull();
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
      'products',
      'Crée un produit Perceuse compacte à 12 900 DZD.',
      ['products_write'],
      'create_product',
    ],
    ['products', 'Archive le produit 12.', ['products_write'], 'archive_products'],
    [
      'analytics',
      'Adopte explicitement le taux de retour observé de 24 % comme taux planifié.',
      ['analytics_manage'],
      'update_analytics_settings',
    ],
    [
      'analytics',
      'Ajoute un coût opérationnel mensuel Entrepôt de 30 000 DZD.',
      ['analytics_manage'],
      'manage_analytics_costs',
    ],
    [
      'analytics',
      'Réinitialise les valeurs automatiques du daily override du 2026-08-21.',
      ['analytics_manage'],
      'manage_analytics_day_overrides',
    ],
    [
      'analytics',
      'Pour le 21 août, enregistre un override quotidien : taux de planification 21 %.',
      ['analytics_manage'],
      'manage_analytics_day_overrides',
    ],
    [
      'analytics',
      'Synchronise Meta du 2026-08-01 au 2026-08-23.',
      ['analytics_manage'],
      'sync_analytics_source',
    ],
    [
      'products',
      'Lance la synchronisation Meta du 2026-08-01 au 2026-08-23.',
      ['analytics_manage'],
      'sync_analytics_source',
    ],
    [
      'stats',
      'Ajoute un coût mensuel Entrepôt de 30 000 DZD.',
      ['analytics_manage'],
      'manage_analytics_costs',
    ],
    [
      'brands_categories',
      'Crée la marque Atelier Pro.',
      ['brands_categories_write'],
      'manage_taxonomy',
    ],
    [
      'brands_categories',
      'Déplace la catégorie 7 sous la catégorie 3.',
      ['brands_categories_write'],
      'manage_taxonomy',
    ],
    ['brands_categories', 'Supprime la marque 9.', ['brands_categories_write'], 'manage_taxonomy'],
  ] as const)(
    'plans one explicit %s mutation after grounding',
    (surface, message, permissions, expected) => {
      expect(adminAiMutationTool({ surface, message, permissions: [...permissions] })).toBe(
        expected,
      );
    },
  );

  it('starts ECOTRACK posting only after an explicit provider choice', () => {
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: "Post today's confirmed orders to ECOTRACK.",
        permissions: ['orders_write'],
      }),
    ).toBeNull();
    expect(
      adminAiMutationTool({
        surface: 'orders',
        message: 'Use Emir for the cohort we just previewed.',
        permissions: ['orders_write'],
      }),
    ).toBe('post_orders_to_ecotrack');
  });

  it('plans canonical ECOTRACK shipment actions ahead of generic order status updates', () => {
    expect(
      adminAiMutationTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Expédie les shipments 91 et 92 sans demander de ramassage.',
        permissions: ['orders_write'],
      }),
    ).toBe('manage_ecotrack_shipments');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Corrige l’erreur ECOTRACK de la commande 92 : commune Bab Ezzouar.',
        permissions: ['orders_write'],
      }),
    ).toBe('update_order_details');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Corrige la commune du shipment 92 en Bab Ezzouar.',
        permissions: ['orders_write'],
      }),
    ).toBe('change_ecotrack_shipments');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Demande le retour du colis ECOTRACK 93.',
        permissions: ['orders_write'],
      }),
    ).toBe('manage_ecotrack_shipments');
    expect(
      adminAiMutationTool({
        surface: 'orders',
        section: 'ecotrack',
        message: 'Prépare les étiquettes des shipments sélectionnés.',
        permissions: ['orders_write'],
      }),
    ).toBe('manage_ecotrack_shipments');
  });

  it.each([
    ['acquisition', 'Synchronise cette période.'],
    ['search', 'Synchronise les données affichées.'],
  ])('uses the current %s workspace to resolve a contextual source sync', (section, message) => {
    expect(
      adminAiMutationTool({
        surface: 'stats',
        section,
        message,
        permissions: ['analytics_manage'],
      }),
    ).toBe('sync_analytics_source');
  });

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
