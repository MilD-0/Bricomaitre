import type { AiEvalScenario } from '@bric/ai-core/evals';

export type AdminAiEvalInput = {
  message: string;
  surface: string;
  locale?: 'fr' | 'ar';
  previousAnalytics?: {
    view: string;
    range: string;
    startDate?: string;
    endDate?: string;
    grain?: string;
    focus?: {
      dimension: string;
      search?: string;
      identifiers?: string[];
      limit?: number;
    };
  };
};

export const ADMIN_AI_EVAL_SCENARIOS: AiEvalScenario<AdminAiEvalInput>[] = [
  {
    id: 'admin-orders-awaiting-confirmation',
    description: 'Uses the canonical order reader for an operational queue question.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quels clients attendent encore une confirmation aujourd’hui ?',
      surface: 'orders',
    },
    expectations: { requiredTools: ['inspect_orders'], minimumAnswerCharacters: 40 },
  },
  {
    id: 'admin-order-status-update',
    description:
      'Inspects an exact order before executing one explicitly requested canonical status update.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Confirme la commande 91.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_orders', 'update_order_status'],
      exactToolCounts: { update_order_status: 1 },
      requiredToolInputs: {
        update_order_status: { items: [{ orderId: 91, status: 'confirmed' }] },
      },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-detail-correction',
    description:
      'Inspects an exact order before correcting delivery and address data through the canonical order workflow.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Corrige la commande 91 : livraison à domicile à Bab Ezzouar, wilaya 16, adresse 12 rue des Outils.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_orders', 'update_order_details'],
      exactToolCounts: { update_order_details: 1 },
      requiredToolInputs: {
        update_order_details: {
          items: [
            {
              orderId: 91,
              operations: [
                { field: 'delivery', value: 'home' },
                { field: 'wilayaId', value: 16 },
                { field: 'commune', value: 'Bab Ezzouar' },
                { field: 'homeAddress', value: '12 rue des Outils' },
              ],
            },
          ],
        },
      },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-create',
    description:
      'Resolves exact products before creating one canonical local order with complete supplied delivery data.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée une commande pour Ahmed Benali, téléphone 0550123456, avec 2 Perceuses Bosch 18 V, livraison à domicile à Bab Ezzouar, wilaya 16, adresse 12 rue des Outils.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['find_products', 'create_order'],
      exactToolCounts: { find_products: 1, create_order: 1 },
      requiredToolInputs: {
        create_order: {
          firstName: 'Ahmed',
          lastName: 'Benali',
          email: null,
          phoneNumber1: '0550123456',
          phoneNumber2: null,
          productIds: [12, 12],
          delivery: 'home',
          wilayaId: 16,
          commune: 'Bab Ezzouar',
          homeAddress: '12 rue des Outils',
          note: null,
          promoCode: null,
        },
      },
      requiredTerms: ['95', '30 400'],
      requiredAnyTerms: [['soumise', 'submitted', 'non confirmée', 'pas confirmée']],
      // The model may correctly negate these outcomes (for example "pas une
      // vente terminée"), so affirmative lifecycle correctness is enforced
      // through the required submitted-demand wording above.
      forbiddenTerms: [],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-delete',
    description:
      'Inspects an exact local order before deletion and discloses that its external shipment may remain.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Supprime la commande locale 91.', surface: 'orders' },
    expectations: {
      requiredTools: ['inspect_orders', 'delete_orders'],
      forbiddenTools: ['manage_ecotrack_shipments'],
      exactToolCounts: { inspect_orders: 1, delete_orders: 1 },
      requiredToolInputs: { delete_orders: { orderIds: [91] } },
      requiredTerms: ['91', 'TRK-91'],
      requiredAnyTerms: [['peut rester', 'peut toujours exister', 'may remain']],
      forbiddenTerms: ['shipment supprimé', 'expédition supprimée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-tracking-link',
    description:
      'Inspects the exact order then issues or reuses its canonical customer tracking link.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Donne-moi le lien de suivi de la commande 91.', surface: 'orders' },
    expectations: {
      requiredTools: ['inspect_orders', 'get_order_tracking_links'],
      exactToolCounts: { inspect_orders: 1, get_order_tracking_links: 1 },
      requiredToolInputs: {
        inspect_orders: { orderIds: [91] },
        get_order_tracking_links: { orderIds: [91] },
      },
      requiredTerms: ['91', 'https://bricomaitre.com/fr/thank-you?token=order-91-token'],
      forbiddenTerms: ['copié dans le presse-papiers', 'envoyé au client'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-export-confirmed',
    description:
      'Previews and starts the native complete recent-confirmed Excel export with its status effect disclosed.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Exporte toutes les commandes confirmées récentes en Excel.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['preview_order_export', 'start_order_export'],
      forbiddenTools: ['start_background_job'],
      exactToolCounts: { preview_order_export: 1, start_order_export: 1 },
      requiredToolInputs: {
        preview_order_export: { mode: 'confirmed', orderIds: [] },
        start_order_export: { mode: 'confirmed', orderIds: [] },
      },
      requiredTerms: ['3', '92', 'adresse'],
      requiredAnyTerms: [
        ['en file', 'mis en file', 'queued'],
        ['expédi', 'dispatch'],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-shopping-list-save',
    description:
      'Builds and saves the native shared shopping list from the complete confirmed cohort without changing inventory.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Prépare la liste d’achat partagée des commandes confirmées.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_order_shopping_list', 'save_order_shopping_list'],
      exactToolCounts: { inspect_order_shopping_list: 1, save_order_shopping_list: 1 },
      requiredToolInputs: {
        inspect_order_shopping_list: {
          sourceMode: 'confirmed',
          orderIds: [],
          title: null,
        },
        save_order_shopping_list: {
          sourceMode: 'confirmed',
          orderIds: [],
          title: null,
        },
      },
      requiredTerms: ['3', '4', '9', '7', '2'],
      requiredAnyTerms: [
        [
          'non appariée',
          'non apparié',
          'non rapprochée',
          'non rapproché',
          'sans correspondance',
          'unmatched',
        ],
        [
          'stock n’a pas été déduit',
          "stock n'a pas été déduit",
          'aucune déduction de stock',
          'aucune quantité de stock n’a été déduite',
          "aucune quantité de stock n'a été déduite",
          'aucun stock n’a été déduit',
          "aucun stock n'a été déduit",
          'aucune quantité d’inventaire n’a été déduite',
          "aucune quantité d'inventaire n'a été déduite",
          'inventaire non déduit',
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-order-shopping-list-apply',
    description:
      'Applies every eligible saved shopping-list line through inventory and reports exact before/after quantities plus partial failures.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Applique au stock toute la liste d’achat partagée des commandes confirmées.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_order_shopping_list', 'apply_order_shopping_list_inventory'],
      exactToolCounts: {
        inspect_order_shopping_list: 1,
        apply_order_shopping_list_inventory: 1,
      },
      requiredToolInputs: {
        inspect_order_shopping_list: {
          sourceMode: 'confirmed',
          orderIds: [],
          title: null,
        },
        apply_order_shopping_list_inventory: {
          sourceMode: 'confirmed',
          orderIds: [],
          selection: 'all',
          draftIds: [],
        },
      },
      requiredTerms: ['Perceuse', '10', '6', 'Foret', '5', '3', 'Disque'],
      requiredAnyTerms: [
        ['insuffisant', 'insuffisante', 'insufficient'],
        [
          '6 unités appliquées',
          '6 unités déduites',
          '6 unités ont été appliquées',
          '6 unités ont été déduites',
          'total réellement déduit du stock : 6 unités',
          'total déduit du stock : 6 unités',
          'total appliqué : 6 unités',
          'total réellement appliqué au stock : 6 unités',
          'total appliqué au stock : 6 unités',
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-preview-provider-choice',
    description:
      'Previews today’s confirmed cohort but does not post before the operator chooses Delivro or Emir.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Poste les commandes confirmées aujourd’hui sur ECOTRACK.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['preview_ecotrack_posting'],
      forbiddenTools: ['post_orders_to_ecotrack'],
      exactToolCounts: { preview_ecotrack_posting: 1 },
      requiredToolInputs: {
        preview_ecotrack_posting: {
          scope: 'confirmed_today',
          orderIds: [],
          businessDate: null,
        },
      },
      requiredTerms: ['Delivro', 'Emir'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-post-emir',
    description:
      'Previews today’s confirmed cohort, then starts exactly one canonical Emir posting job.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Poste les commandes confirmées aujourd’hui sur ECOTRACK avec Emir.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['preview_ecotrack_posting', 'post_orders_to_ecotrack'],
      exactToolCounts: { post_orders_to_ecotrack: 1 },
      requiredToolInputs: {
        preview_ecotrack_posting: {
          scope: 'confirmed_today',
          orderIds: [],
          businessDate: null,
        },
        post_orders_to_ecotrack: {
          provider: 'emir',
          scope: 'confirmed_today',
          orderIds: [91, 92],
          businessDate: '2026-08-23',
        },
      },
      forbiddenTerms: ['posting est terminé', 'toutes créées'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-repair-invalid-commune',
    description:
      'Loads canonical ECOTRACK requirements and live destination evidence before repairing an invalid commune.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Corrige l’erreur ECOTRACK de la commande 92 : la commune est Bab Ezzouar, wilaya 16.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['load_ecotrack_requirements', 'update_order_details'],
      exactToolCounts: { update_order_details: 1 },
      requiredToolInputs: {
        load_ecotrack_requirements: {
          orderIds: [92],
          provider: null,
          wilayaId: 16,
          communeQuery: 'Bab Ezzouar',
        },
        update_order_details: {
          items: [
            {
              orderId: 92,
              operations: [
                { field: 'wilayaId', value: 16 },
                { field: 'commune', value: 'Bab Ezzouar' },
              ],
            },
          ],
        },
      },
      forbiddenTerms: ['inventé', 'proposition'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-shipment-history',
    description:
      'Reads fresh native shipment state and carrier history instead of generic local order data.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Montre le statut, les MAJ et le suivi du shipment ECOTRACK de la commande 91.',
      surface: 'orders/ecotrack',
    },
    expectations: {
      requiredTools: ['inspect_ecotrack_shipments'],
      forbiddenTools: ['inspect_orders'],
      requiredToolInputs: {
        inspect_ecotrack_shipments: { scope: 'exact', orderIds: [91] },
      },
      requiredTerms: ['TRK-91', 'Client appelé'],
      requiredAnyTerms: [['en_livraison', 'en livraison']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-shipment-dispatch',
    description:
      'Inspects exact shipments before one native bulk dispatch and preserves partial failure evidence.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Expédie les shipments ECOTRACK des commandes 91 et 92 sans demander de ramassage.',
      surface: 'orders/ecotrack',
    },
    expectations: {
      requiredTools: ['inspect_ecotrack_shipments', 'manage_ecotrack_shipments'],
      exactToolCounts: { manage_ecotrack_shipments: 1 },
      requiredToolInputs: {
        inspect_ecotrack_shipments: { scope: 'exact', orderIds: [91, 92] },
        manage_ecotrack_shipments: {
          action: 'dispatch',
          orderIds: [91, 92],
          askCollection: false,
        },
      },
      requiredTerms: ['91', '92', 'plus dispatchable'],
      forbiddenTerms: ['toutes expédiées', 'toutes réussies'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-ecotrack-shipment-change',
    description:
      'Changes the posted carrier shipment with an explicit patch while preserving every unmentioned field.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Corrige le shipment ECOTRACK de la commande 91 : commune Bab Ezzouar et adresse 12 rue des Outils.',
      surface: 'orders/ecotrack',
    },
    expectations: {
      requiredTools: ['inspect_ecotrack_shipments', 'change_ecotrack_shipments'],
      exactToolCounts: { change_ecotrack_shipments: 1 },
      forbiddenTools: ['update_order_details'],
      requiredToolInputs: {
        inspect_ecotrack_shipments: { scope: 'exact', orderIds: [91] },
        change_ecotrack_shipments: {
          items: [
            {
              orderId: 91,
              mode: 'auto',
              operations: [
                { field: 'commune', value: 'Bab Ezzouar' },
                { field: 'homeAddress', value: '12 rue des Outils' },
              ],
            },
          ],
        },
      },
      requiredTerms: ['TRK-91'],
      requiredAnyTerms: [['modifié', 'modifiée', 'corrigé', 'corrigée', 'mise à jour']],
      forbiddenTerms: ['recréée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-inventory-low-stock',
    description: 'Routes low-stock diagnosis to live inventory data.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Montre-moi les références presque épuisées.', surface: 'inventory' },
    expectations: { requiredTools: ['inspect_inventory'] },
  },
  {
    id: 'admin-inventory-adjustment',
    description: 'Resolves an exact SKU before applying an explicitly requested inventory delta.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Ajoute 6 unités au stock de la référence PB-1.',
      surface: 'inventory',
    },
    expectations: {
      requiredTools: ['inspect_inventory', 'adjust_inventory'],
      exactToolCounts: { adjust_inventory: 1 },
      requiredToolInputs: {
        inspect_inventory: { scope: 'search', query: 'PB-1' },
        adjust_inventory: { mode: 'increase', items: [{ productId: 12, quantity: 6 }] },
      },
      requiredTerms: ['2', '8'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-inventory-order-receipt',
    description:
      'Uses the native order scanner as a read-only preview before receiving every matched order line.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Scanne la commande 50 et remets tous ses produits correspondants en stock.',
      surface: 'inventory',
    },
    expectations: {
      requiredTools: ['scan_inventory', 'receive_inventory'],
      exactToolCounts: { scan_inventory: 1, receive_inventory: 1 },
      requiredToolInputs: {
        scan_inventory: { query: '50' },
        receive_inventory: {
          source: 'order_scan',
          orderId: 50,
          items: [
            { productId: 12, quantity: 2 },
            { productId: 18, quantity: 1 },
          ],
        },
      },
      requiredTerms: ['50', 'Perceuse', 'Foret'],
      requiredAnyTerms: [
        ['6', 'six'],
        ['3', 'trois'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-inventory-barcode-state',
    description: 'Updates one exact inspected barcode through the native Inventory state workflow.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Pour le produit 12, remplace son code-barres par DRILL-2026.',
      surface: 'inventory',
    },
    expectations: {
      requiredTools: ['inspect_inventory', 'update_inventory_state'],
      exactToolCounts: { inspect_inventory: 1, update_inventory_state: 1 },
      requiredToolInputs: {
        inspect_inventory: { scope: 'exact', productIds: [12] },
        update_inventory_state: {
          items: [
            {
              productId: 12,
              operations: [{ field: 'barcode', value: 'DRILL-2026' }],
            },
          ],
        },
      },
      requiredTerms: ['12', 'DRILL-2026'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-assets-performance',
    description: 'Inspects live asset inventory instead of guessing from product data.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quelles images produits manquent ou sont trop lourdes ?',
      surface: 'assets',
    },
    expectations: { requiredTools: ['inspect_assets'] },
  },
  {
    id: 'admin-asset-activation',
    description:
      'Inspects the exact featured group before activating it and placing it at the top of products.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Active le groupe vedette 7 et affiche-le en haut de la page produits.',
      surface: 'assets',
    },
    expectations: {
      requiredTools: ['inspect_assets', 'update_asset_state'],
      exactToolCounts: { update_asset_state: 1 },
      requiredToolInputs: {
        update_asset_state: {
          items: [{ kind: 'featured-group', id: 7, active: true, showAtTopOfProductsPage: true }],
        },
      },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-asset-featured-group-create',
    description:
      'Inspects current merchandising before directly creating one bilingual featured group with exact product IDs.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée un groupe vedette « Sélection atelier » / « اختيار الورشة » avec les produits 12 et 18, inactif pour le moment.',
      surface: 'assets',
    },
    expectations: {
      requiredTools: ['inspect_assets', 'manage_assets'],
      exactToolCounts: { manage_assets: 1 },
      requiredToolInputs: {
        manage_assets: {
          operation: 'create',
          asset: {
            kind: 'featured-group',
            data: {
              name: 'Sélection atelier',
              nameAr: 'اختيار الورشة',
              productIds: [12, 18],
              active: false,
            },
          },
        },
      },
      forbiddenTools: ['suggest_featured_products'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-landing-page-create',
    description:
      'Resolves the exact product before directly generating and persisting one validated landing-page draft.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée une landing page française pour le produit 12, pensée pour les artisans mobiles. Garde-la en brouillon.',
      surface: 'assets/landingPages',
    },
    expectations: {
      requiredTools: ['find_products', 'create_landing_page'],
      exactToolCounts: { create_landing_page: 1 },
      requiredToolInputs: {
        create_landing_page: { productId: 12, locale: 'fr', active: false },
      },
      forbiddenTools: ['suggest_landing_page'],
      requiredTerms: ['51', 'brouillon'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-landing-page-edit',
    description:
      'Reads the complete current landing-page revision before a staged, revision-safe content edit.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Réécris uniquement le hero de la landing page 41 pour les artisans mobiles et préserve le reste.',
      surface: 'assets/landingPages',
    },
    expectations: {
      requiredTools: ['inspect_landing_pages', 'edit_landing_page'],
      exactToolCounts: { edit_landing_page: 1 },
      requiredToolInputs: {
        edit_landing_page: { landingPageId: 41, expectedRevision: 3 },
      },
      forbiddenTools: ['suggest_landing_page'],
      requiredTerms: ['41'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-landing-page-create-from-product-workspace',
    description:
      'Treats explicit landing-page creation as a first-class product-workspace action instead of requiring navigation to Assets.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Conçois une landing page française pour le produit sélectionné 12, orientée artisans mobiles, et garde-la en brouillon.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['find_products', 'create_landing_page'],
      exactToolCounts: { create_landing_page: 1 },
      requiredToolInputs: {
        create_landing_page: { productId: 12, locale: 'fr', active: false },
      },
      forbiddenTools: ['suggest_landing_page'],
      requiredTerms: ['51', 'brouillon'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-landing-page-edit-from-product-workspace',
    description:
      'Inspects and improves an exact landing-page revision from another relevant workspace while preserving unaffected sections.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Améliore uniquement le hero de la landing page 41 pour mobile et préserve toutes les autres sections exactement.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['inspect_landing_pages', 'edit_landing_page'],
      exactToolCounts: { edit_landing_page: 1 },
      requiredToolInputs: {
        edit_landing_page: { landingPageId: 41, expectedRevision: 3 },
      },
      forbiddenTools: ['suggest_landing_page'],
      requiredTerms: ['41'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-proposal-backlog',
    description: 'Reads the proposal inbox with its active filters.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Résume les propositions IA qui attendent une revue.',
      surface: 'ai_proposals',
    },
    expectations: { requiredTools: ['inspect_ai_proposals'] },
  },
  {
    id: 'admin-proposal-approval',
    description:
      'Inspects an exact pending proposal before applying the operator’s explicit approval.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Vérifie puis approuve la proposition 44.',
      surface: 'ai_proposals',
    },
    expectations: {
      requiredTools: ['inspect_ai_proposals', 'review_ai_proposals'],
      exactToolCounts: { review_ai_proposals: 1 },
      requiredToolInputs: {
        review_ai_proposals: { proposalIds: [44], action: 'approve' },
      },
      requiredTerms: ['44'],
      requiredAnyTerms: [['appliquée', 'appliqué', 'approuvée', 'approuvé']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-proposal-expired-cleanup',
    description:
      'Inspects the proposal inbox before deleting only exact expired pending proposals.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Supprime les propositions expirées, dont la proposition 44.',
      surface: 'ai_proposals',
    },
    expectations: {
      requiredTools: ['inspect_ai_proposals', 'delete_expired_ai_proposals'],
      exactToolCounts: { delete_expired_ai_proposals: 1 },
      requiredToolInputs: { delete_expired_ai_proposals: { proposalIds: [44] } },
      forbiddenTools: ['review_ai_proposals'],
      requiredTerms: ['44'],
      requiredAnyTerms: [['supprimée', 'supprimé']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-staff-access',
    description: 'Uses complete administration access records for a staff question.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Qui a accès aux commandes et à la gestion du catalogue ?',
      surface: 'administration',
    },
    expectations: { requiredTools: ['inspect_administration'] },
  },
  {
    id: 'admin-staff-access-assignment',
    description: 'Reads live roles and grants before assigning one exact staff account.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Donne le rôle employé à operator@example.com.',
      surface: 'administration',
    },
    expectations: {
      requiredTools: ['inspect_administration', 'set_access_grant'],
      exactToolCounts: { set_access_grant: 1 },
      requiredToolInputs: {
        set_access_grant: { email: 'operator@example.com', role: 'employee' },
      },
      requiredTerms: ['operator@example.com', 'employé'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-staff-access-revocation',
    description:
      'Resolves the exact staff access-grant ID before revoking the account through canonical history.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Révoque l’accès de operator@example.com.',
      surface: 'administration/users',
    },
    expectations: {
      requiredTools: ['inspect_administration', 'revoke_access_grants'],
      forbiddenTools: ['set_access_grant'],
      exactToolCounts: { inspect_administration: 1, revoke_access_grants: 1 },
      requiredToolInputs: { revoke_access_grants: { accessGrantIds: [9] } },
      requiredTerms: ['operator@example.com'],
      requiredAnyTerms: [['révoqué', 'révoquée', 'supprimé', 'supprimée']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-custom-role-create',
    description:
      'Reads live roles and the permission catalog before creating one complete custom role.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Crée le rôle Support avec accès aux commandes et aux opérations.',
      surface: 'administration',
    },
    expectations: {
      requiredTools: ['inspect_administration', 'set_role_definition'],
      exactToolCounts: { set_role_definition: 1 },
      requiredToolInputs: {
        set_role_definition: {
          roleDefinitionId: null,
          name: 'Support',
          permissions: ['orders_write', 'ops_view'],
        },
      },
      requiredTerms: ['Support'],
      requiredAnyTerms: [
        ['commandes', 'orders'],
        ['opérations', 'operations'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-action-history-inspect',
    description:
      'Reads one exact native action-log entry with semantic changes and current recovery state.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Explique l’action 44 sélectionnée et dis-moi si elle peut être annulée.',
      surface: 'administration/history',
    },
    expectations: {
      requiredTools: ['inspect_action_history'],
      forbiddenTools: ['inspect_products', 'update_products', 'recover_action_history'],
      exactToolCounts: { inspect_action_history: 1 },
      requiredToolInputs: {
        inspect_action_history: { scope: 'exact', actionLogIds: [44] },
      },
      requiredTerms: ['Editor', 'Perceuse Bosch 18 V', '15 000', '14 900'],
      requiredAnyTerms: [['annulée', 'annuler', 'undo']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-action-history-undo',
    description:
      'Inspects one exact action log before undoing it through canonical transactional recovery.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Annule l’action 44 du journal des actions.',
      surface: 'administration/history',
    },
    expectations: {
      requiredTools: ['inspect_action_history', 'recover_action_history'],
      forbiddenTools: ['update_products'],
      exactToolCounts: { inspect_action_history: 1, recover_action_history: 1 },
      requiredToolInputs: {
        inspect_action_history: { scope: 'exact', actionLogIds: [44] },
        recover_action_history: { items: [{ actionLogId: 44, direction: 'undo' }] },
      },
      requiredTerms: ['44'],
      requiredAnyTerms: [['annulée', 'annulé', 'restauré', 'undo']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-bulletin-follow-up',
    description: 'Reads the full Bulletin thread before summarizing open follow-ups.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quels sujets du Bulletin demandent encore une réponse ?',
      surface: 'bulletin',
    },
    expectations: { requiredTools: ['inspect_bulletin'] },
  },
  {
    id: 'admin-bulletin-reply',
    description: 'Reads the exact shared thread before posting an explicitly requested reply.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Réponds au sujet 7 que je terminerai les vérifications cet après-midi.',
      surface: 'bulletin',
    },
    expectations: {
      requiredTools: ['inspect_bulletin', 'reply_bulletin_post'],
      exactToolCounts: { reply_bulletin_post: 1 },
      requiredToolInputs: {
        reply_bulletin_post: {
          postId: 7,
          body: 'Je terminerai les vérifications cet après-midi.',
        },
      },
      requiredTerms: ['7'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-bulletin-reaction',
    description:
      'Inspects the exact Bulletin thread before idempotently adding the requested native reaction.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Ajoute 👍 au post Bulletin 7.', surface: 'bulletin' },
    expectations: {
      requiredTools: ['inspect_bulletin', 'set_bulletin_reaction'],
      exactToolCounts: { inspect_bulletin: 1, set_bulletin_reaction: 1 },
      requiredToolInputs: {
        set_bulletin_reaction: { kind: 'post', postId: 7, emoji: '👍', action: 'add' },
      },
      requiredTerms: ['7', '👍'],
      requiredAnyTerms: [['ajoutée', 'ajouté', 'active', 'réagi', 'reacted']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-bulletin-pin',
    description: 'Inspects the exact Bulletin post before explicitly pinning it.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Épingle le sujet 7.', surface: 'bulletin' },
    expectations: {
      requiredTools: ['inspect_bulletin', 'update_bulletin_post'],
      exactToolCounts: { update_bulletin_post: 1 },
      requiredToolInputs: { update_bulletin_post: { postId: 7, pinned: true } },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-bulletin-reply-delete',
    description: 'Inspects the complete thread before deleting one exact permitted reply.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Supprime la réponse 9 du sujet 7.', surface: 'bulletin' },
    expectations: {
      requiredTools: ['inspect_bulletin', 'delete_bulletin_content'],
      exactToolCounts: { delete_bulletin_content: 1 },
      requiredToolInputs: { delete_bulletin_content: { kind: 'reply', replyId: 9 } },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-acquisition',
    description: 'Routes acquisition analysis through the canonical analytics workspace.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Compare les canaux payants par commandes et revenu ce mois-ci.',
      surface: 'analytics',
    },
    expectations: { requiredTools: ['query_analytics'], forbiddenTools: ['inspect_orders'] },
  },
  {
    id: 'admin-analytics-conversation-follow-up',
    description:
      'Preserves the latest exact analytics entity, range, and workspace after navigation.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Pourquoi a-t-elle baissé ?',
      surface: 'products',
      previousAnalytics: {
        view: 'acquisition',
        range: 'custom',
        startDate: '2026-08-01',
        endDate: '2026-08-23',
        grain: 'day',
        focus: {
          dimension: 'campaigns',
          search: 'Alpha',
          identifiers: ['campaign-alpha'],
          limit: 20,
        },
      },
    },
    expectations: {
      requiredTools: ['query_analytics'],
      forbiddenTools: ['inspect_products'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
          grain: 'day',
          focus: {
            dimension: 'campaigns',
            search: 'Alpha',
            identifiers: ['campaign-alpha'],
            limit: 20,
          },
        },
      },
      requiredAnyTerms: [['alpha', 'campagne']],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-product-focus',
    description:
      'Uses the canonical catalog product decision dataset instead of accepting the generic dashboard truncation.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Analyse précisément la performance opérationnelle du produit « Perceuse Bosch 18 V » sur les 90 derniers jours : unités postées, unités payées et contribution.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'catalog',
          range: '90d',
          focus: { dimension: 'products' },
        },
      },
    },
  },
  {
    id: 'admin-analytics-submitted-is-not-sale',
    description:
      'Keeps submitted demand, delivered outcomes, and paid outcomes semantically separate.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Du 1er au 23 août 2026, combien avons-nous fait de ventes ? Distingue précisément les commandes soumises, livrées et payées.',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'fulfillment',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
          focus: { dimension: 'cash_pipeline' },
        },
      },
      requiredTerms: ['128', '79', '61'],
      requiredAnyTerms: [
        ['commandes soumises', 'demandes soumises'],
        ['commandes livrées', 'livrées'],
        ['commandes payées', 'payées'],
      ],
      requiredConcepts: [[['vente'], ['finalis', 'réalis', 'termin'], ['pas', 'non', 'ne ']]],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-paid-funnel-semantics',
    description:
      'Keeps Meta exposure, attributed submitted demand, and later EcoTrack paid outcomes distinct inside one paid funnel.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Explique l’entonnoir payant sur les 30 derniers jours, des impressions Meta aux commandes Bricomaitre puis payées. Ces étapes sont-elles directement interchangeables ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'acquisition',
          range: '30d',
          focus: { dimension: 'paid_funnel' },
        },
      },
      requiredTerms: ['180', '90', '54'],
      requiredAnyTerms: [
        ['impressions meta', 'impressions rapportées par meta'],
        ['commandes bricomaitre', 'demande soumise', 'commandes soumises'],
        ['ecotrack', 'issues payées', 'commandes payées'],
      ],
      requiredConcepts: [
        [
          ['impression', 'exposition meta'],
          ['commande', 'demande'],
          ['payee', 'payée', 'paiement', 'ecotrack'],
          ['non', 'different', 'différent', 'distinct', 'interchange', 'substitu', 'pas le meme'],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-submitted-is-not-sale-ar',
    description: 'Preserves the submitted-versus-paid lifecycle distinction in Arabic.',
    surface: 'admin',
    locale: 'ar',
    input: {
      message:
        'لدينا كم من المبيعات هذا الشهر؟ افصل بدقة بين الطلبات المقدمة والطلبات المسلمة والمدفوعة.',
      surface: 'analytics',
      locale: 'ar',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'fulfillment',
          focus: { dimension: 'cash_pipeline' },
        },
      },
      requiredTerms: ['128', '61'],
      requiredAnyTerms: [
        ['الطلبات المقدمة', 'طلبات مقدمة', 'طلبًا مقدمًا', 'طلباً مقدماً'],
        ['ليست مبيعات مكتملة', 'لا تعني مبيعات مكتملة', 'ليست مبيعات منجزة'],
        ['الطلبات المدفوعة', 'طلبات مدفوعة', 'طلبًا مدفوعًا', 'طلباً مدفوعاً', 'مدفوعة'],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-paid-contribution-vs-true-profit',
    description:
      'Separates automatic paid contribution from planning-based whole-business true profit.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Compare la contribution payée automatique au vrai profit sur les 30 derniers jours. Est-ce que le montant payé est notre profit global ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: { query_analytics: { view: 'money', range: '30d' } },
      requiredTerms: ['310', '145'],
      requiredAnyTerms: [
        ['contribution payée automatique', 'contribution payée', 'profit payé automatique'],
        ['vrai profit', 'profit réel'],
      ],
      requiredConcepts: [
        [
          ['contribution payée', 'montant payé', 'profit payé'],
          ['vrai profit', 'profit global', 'profit de toute l’entreprise'],
          ['pas', 'non', 'ne ', 'distinct', 'différent'],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-profit-investigation',
    description:
      'Diagnoses a profit decline from aligned Money, Acquisition, and Fulfillment evidence in one tool call.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Pourquoi notre vrai profit a-t-il chuté sur les 30 derniers jours ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: { query_analytics: { view: 'money', range: '30d' } },
      requiredAnyTerms: [
        ['profit vrai', 'vrai profit'],
        ['meta', 'publicitaire', 'acquisition'],
        ['livraison', 'expedition', 'expédition', 'fulfillment', 'payee', 'payée'],
      ],
      requiredConcepts: [
        [
          [
            'periode commune',
            'période commune',
            'plage commune',
            'couverture commune',
            'perimetre commun',
            'périmètre commun',
            'periode comparable',
            'période comparable',
          ],
          ['16 aout', '16 août', '2026-08-16'],
        ],
      ],
      forbiddenTerms: ['prouve que', 'cause certaine', 'cause definitive', 'cause définitive'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-observed-return-is-not-planning',
    description:
      'Treats the mature observed return rate as evidence rather than silently changing projections.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Le taux de retour observé est-il devenu notre hypothèse de projection ? Compare les deux taux et dis-moi ce qui changerait les projections.',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: { query_analytics: { view: 'assumptions' } },
      requiredTerms: ['18', '24'],
      requiredAnyTerms: [
        [
          'taux de planification',
          'taux planifié',
          'hypothèse de planification',
          'hypothèse actuellement utilisée pour les projections',
          'hypothèse de projection actuelle',
          'hypothèse utilisée par les projections',
          'taux de projection actuel',
        ],
        ['taux observé', 'retour observé'],
        [
          'action explicite',
          'adoption explicite',
          'changement explicite',
          'modifier explicitement',
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-common-source-cutoff',
    description: 'Uses the common source cutoff and never fills a missing tail with zero.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Croise commandes, Meta et EcoTrack du 1er au 23 août 2026 pour juger l’acquisition payante. Que valent les résultats du 17 au 23 août ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
        },
      },
      requiredAnyTerms: [['16 août', '2026-08-16']],
      requiredConcepts: [
        [
          ['commun', 'comparable'],
          ['période', 'fenêtre', 'couverture', 'plage', 'périmètre'],
        ],
        [
          ['indispon', 'absent', 'manquant', 'pas encore'],
          ['zéro', 'nul'],
          ['pas', 'non', 'ne '],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-meta-attribution-window',
    description:
      'Refuses to infer historical campaign identity outside exact first-party attribution coverage.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Analyse les campagnes du 1er au 23 août 2026. Comme la table ne montre que Campagne Alpha, était-ce la seule campagne active avant le 10 août ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
          focus: { dimension: 'campaigns' },
        },
      },
      requiredAnyTerms: [
        ['10 août', '2026-08-10'],
        ['17 août', '2026-08-17'],
        [
          'ne permet pas de conclure',
          'ne peut pas établir',
          'ne permet pas d’établir',
          "ne permet pas d'établir",
          'ne permettent pas d’établir',
          "ne permettent pas d'établir",
          'impossible de conclure',
          'pas que les autres campagnes étaient absentes',
        ],
        [
          'couverture d’attribution',
          "couverture d'attribution",
          'attribution exacte',
          'attribution historique',
          'capture immuable',
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-modeled-decline',
    description: 'Labels a dotted forecast decline as modeled rather than an observed collapse.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'La courbe pointillée plonge après le 23 août. Est-ce un effondrement réellement observé du profit ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'money', focus: { dimension: 'forecast' } },
      },
      requiredAnyTerms: [
        ['modélisé', 'projection', 'prévision'],
        [
          'pas observé',
          'non observé',
          'n’est pas observé',
          "n'est pas observé",
          'pas un effondrement réellement observé',
          'pas de résultats comptables finalisés',
          'ne permettent pas d’établir qu’un effondrement réel',
          "ne permettent pas d'établir qu'un effondrement réel",
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-search-position-direction',
    description: 'Understands that a lower Search Console average position is better.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Notre position Search Console passe de 8,4 à 5,2. Est-ce une dégradation ? Explique le sens de la métrique.',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'search', focus: { dimension: 'search_trend' } },
      },
      requiredAnyTerms: [
        ['5,2', '5.2'],
        ['amélioration', 'meilleure position', 's’est améliorée', "s'est améliorée"],
      ],
      requiredConcepts: [
        [
          ['position'],
          ['bas', 'baisse', 'diminu', '5,2', '5.2'],
          ['meilleur', 'amélior', 'favorable', 'plus haut'],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-profit-x-zero-spend',
    description: 'Reports Profit × as unavailable when comparable Meta ad cost is zero.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Quel est le Profit × de la période si aucune dépense Meta comparable n’est enregistrée ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: { query_analytics: { view: 'money' } },
      requiredAnyTerms: [
        ['indisponible', 'non disponible', 'non calculable'],
        [
          'ni zéro ni infini',
          'ni 0, ni l’infini',
          "ni 0, ni l'infini",
          'ni 0 ni l’infini',
          "ni 0 ni l'infini",
          'non égal à zéro ou à l’infini',
          "non égal à zéro ou à l'infini",
          'ni égal à zéro ni égal à l’infini',
          "ni égal à zéro ni égal à l'infini",
          'ni égal à zéro ni infini',
          'pas zéro',
          'pas infini',
          'pas une valeur infinie',
          'aucune valeur infinie',
        ],
      ],
      requiredConcepts: [
        [
          ['meta', 'publicitaire'],
          ['0', 'zéro', 'nul', 'aucune'],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-missing-cost-estimation',
    description:
      'Qualifies profit with exact-cost coverage and the canonical fallback margin without overstating precision.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Le vrai profit affiché est-il entièrement basé sur des coûts d’achat exacts ? Quantifie la couverture et explique le reste.',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: { query_analytics: { view: 'money' } },
      requiredAnyTerms: [
        ['92 %', '92%'],
        ['30 %', '30%'],
        ['marge estimée', 'estimation de marge', 'fallback'],
        ['pas entièrement', 'partiellement estimé', 'contient une estimation'],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-friday-accounting',
    description:
      'Explains Friday calculator roll-forward without claiming actual Meta timestamps moved.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Pourquoi la dépense Meta du vendredi apparaît-elle sur le prochain jour ouvré dans le calculateur ? Les horodatages réels ont-ils été déplacés ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'money', focus: { dimension: 'friday_weeks' } },
      },
      requiredAnyTerms: [
        ['jour de repos', 'vendredi sans activité'],
        ['calculateur', 'comptabilité du calculateur'],
      ],
      requiredConcepts: [
        [
          ['vendredi'],
          ['reste', 'conserv', 'demeure'],
          ['enregistr', 'date réelle', 'horodatage original', 'dépense réelle', 'depense reelle'],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-delivery-attempt-telemetry',
    description:
      'Treats zero recorded delivery attempts as missing provider telemetry, not proof of no attempt.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Une commande livrée affiche zéro tentative de livraison. Est-ce la preuve qu’aucune tentative n’a eu lieu ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'fulfillment', focus: { dimension: 'attempt_outcomes' } },
      },
      requiredAnyTerms: [['télémétrie', 'données EcoTrack', 'données du transporteur']],
      requiredConcepts: [
        [['absent', 'manqu', 'indispon', 'non fourni', 'pas transmis', 'aucun détail']],
        [
          ['tentative'],
          [
            'ne prouve pas',
            'pas la preuve',
            'ne signifie pas',
            'pas nécessairement',
            'ne permet pas',
            'on ne peut pas',
            'impossible',
            'n’indique pas',
            "n'indique pas",
            'pas qu’aucune',
            "pas qu'aucune",
          ],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-storefront-funnel',
    description:
      'Reads the complete deferred Storefront funnel as distinct sessions and keeps submitted demand separate from paid sales.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Analyse le funnel des sessions boutique sur 30 jours, de la vue produit à la commande soumise. Est-ce un funnel de ventes payées ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'storefront', focus: { dimension: 'storefront_funnel' } },
      },
      requiredAnyTerms: [
        ['1 000', '1000', '1 000'],
        ['650'],
        ['280'],
        ['160'],
        ['80'],
        ['sessions distinctes', 'sessions uniques', 'sessions, pas'],
        ['commandes soumises', 'commande soumise'],
        [
          'pas des ventes payées',
          'ne sont pas des ventes payées',
          'pas un funnel de ventes payées',
          'commande soumise n’est pas une vente payée',
          "commande soumise n'est pas une vente payee",
          'pas d’un funnel de ventes encaissées',
          "pas d'un funnel de ventes encaissees",
          'demande soumise, pas d’un funnel de ventes encaissées',
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-search-index-health',
    description: 'Uses the modern Search Console index-health dataset and does not infer traffic.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Montre les problèmes d’indexation Search Console. Ces URL prouvent-elles que leur trafic organique est nul ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'search', focus: { dimension: 'search_index_issues' } },
      },
      requiredTerms: ['/products/drill-18v'],
      requiredConcepts: [
        [
          ['indexation', 'inspection', 'index'],
          ['trafic', 'clic', 'visibilite'],
          ['pas', 'non', 'ne '],
        ],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-creative-diagnostics',
    description:
      'Uses current Meta creative diagnostics without presenting correlation as causality.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Le CPM monte et le CTR sortant baisse. Analyse la fatigue créative Meta : est-ce la preuve certaine que la créa cause la baisse ?',
      surface: 'analytics',
    },
    expectations: {
      requiredTools: ['query_analytics'],
      exactToolCounts: { query_analytics: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'acquisition', focus: { dimension: 'meta_daily' } },
      },
      requiredAnyTerms: [
        ['6,2', '6.2'],
        ['9,1', '9.1'],
        ['2,4', '2.4'],
        ['1,3', '1.3'],
        ['diagnostic', 'signal', 'indicateur'],
        ['ne prouve pas', 'pas une preuve', 'ne permet pas d’établir', "ne permet pas d'établir"],
        ['causalité', 'cause certaine', 'lien causal', 'créa cause la baisse', 'cause la baisse'],
      ],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-adopt-planning-return',
    description:
      'Reads the current planning-versus-observed policy before explicitly adopting the observed mature rate.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Adopte le taux de retour observé mature de 24 % comme nouveau taux de planification.',
      surface: 'stats/assumptions',
    },
    expectations: {
      requiredTools: ['query_analytics', 'update_analytics_settings'],
      exactToolCounts: { query_analytics: 1, update_analytics_settings: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'assumptions' },
        update_analytics_settings: { planningReturnRate: 24 },
      },
      requiredTerms: ['24'],
      requiredAnyTerms: [
        ['taux de planification', 'taux planifié', 'hypothèse de planification'],
        ['enregistré', 'persisté', 'mis à jour', 'adopté'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-create-operating-cost',
    description:
      'Reads canonical operating costs before creating one exact persisted monthly cost.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Ajoute un coût opérationnel mensuel « Entrepôt » de 30 000 DZD à partir du 1er septembre 2026.',
      surface: 'stats/assumptions',
    },
    expectations: {
      requiredTools: ['query_analytics', 'manage_analytics_costs'],
      exactToolCounts: { query_analytics: 1, manage_analytics_costs: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'assumptions', focus: { dimension: 'operating_costs' } },
        manage_analytics_costs: {
          operations: [
            {
              action: 'create',
              name: 'Entrepôt',
              amountDzd: 30_000,
              period: 'monthly',
              startDate: '2026-09-01',
              endDate: null,
            },
          ],
        },
      },
      requiredTerms: ['Entrepôt'],
      requiredAnyTerms: [
        ['30 000', '30000', '30 000'],
        ['mensuel', 'monthly', 'par mois', 'récurrent'],
        ['créé', 'enregistré', 'persisté', 'ajouté'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-daily-override',
    description:
      'Reads the owning assumptions view before persisting only the explicitly named calculator-day overrides.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Pour le 21 août 2026, enregistre un override quotidien : taux de planification 21 % et note « Fermeture fournisseur ».',
      surface: 'stats/assumptions',
    },
    expectations: {
      requiredTools: ['query_analytics', 'manage_analytics_day_overrides'],
      exactToolCounts: { query_analytics: 1, manage_analytics_day_overrides: 1 },
      requiredToolInputs: {
        query_analytics: { view: 'assumptions', focus: { dimension: 'daily_assumptions' } },
        manage_analytics_day_overrides: {
          operations: [
            {
              action: 'upsert',
              date: '2026-08-21',
              changes: {
                planningReturnRate: 21,
                note: 'Fermeture fournisseur',
              },
            },
          ],
        },
      },
      requiredTerms: ['21', 'Fermeture fournisseur'],
      requiredAnyTerms: [
        ['21 août', '2026-08-21'],
        ['enregistré', 'persisté', 'sauvegardé'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-sync-meta',
    description:
      'Reads current acquisition coverage before synchronizing one exact Meta date range through the canonical integration.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Synchronise Meta du 1er au 23 août 2026 et rapporte le résultat exact.',
      surface: 'stats/acquisition',
    },
    expectations: {
      requiredTools: ['query_analytics', 'sync_analytics_source'],
      exactToolCounts: { query_analytics: 1, sync_analytics_source: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'acquisition',
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-23',
        },
        sync_analytics_source: {
          source: 'meta',
          since: '2026-08-01',
          until: '2026-08-23',
        },
      },
      requiredTerms: ['Meta', '23'],
      requiredAnyTerms: [
        ['1er août', '1 août', '1er au 23 août', '2026-08-01', '01/08/2026'],
        ['23 août', '2026-08-23'],
        ['terminée', 'terminé', 'synchronisé', 'completed'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-analytics-sync-search',
    description:
      'Reads current organic coverage before synchronizing one exact Search Console range through the canonical integration.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Synchronise Search Console du 5 au 20 août 2026 et rapporte le résultat exact.',
      surface: 'stats/search',
    },
    expectations: {
      requiredTools: ['query_analytics', 'sync_analytics_source'],
      exactToolCounts: { query_analytics: 1, sync_analytics_source: 1 },
      requiredToolInputs: {
        query_analytics: {
          view: 'search',
          range: 'custom',
          startDate: '2026-08-05',
          endDate: '2026-08-20',
        },
        sync_analytics_source: {
          source: 'searchConsole',
          since: '2026-08-05',
          until: '2026-08-20',
        },
      },
      requiredTerms: ['Search Console', '19'],
      requiredAnyTerms: [
        ['5 août', '5 au 20 août', '2026-08-05', '05/08/2026'],
        ['20 août', '2026-08-20', '20/08/2026'],
        ['terminée', 'terminé', 'synchronisé', 'completed'],
      ],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-categorize-entire-catalog',
    description: 'Starts exactly one resumable bulk categorization job.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Catégorise tout le catalogue actif.', surface: 'products' },
    expectations: {
      requiredTools: ['categorize_catalog'],
      exactToolCounts: { categorize_catalog: 1 },
      forbiddenTools: ['propose_product_edit'],
    },
  },
  {
    id: 'admin-fill-arabic-content',
    description: 'Uses one bulk content job for missing Arabic product content.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Complète tous les titres arabes manquants.', surface: 'products' },
    expectations: {
      requiredTools: ['generate_product_content'],
      exactToolCounts: { generate_product_content: 1 },
      forbiddenTools: ['propose_product_edit'],
    },
  },
  {
    id: 'admin-discount-proposal',
    description: 'Resolves the product and produces one reviewable discount proposal.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Propose 10 % de remise sur la perceuse Bosch 18 V.', surface: 'products' },
    expectations: { requiredTools: ['find_products', 'suggest_discount'] },
  },
  {
    id: 'admin-product-commercial-update',
    description:
      'Reads the complete current product before directly changing exact selling and purchase prices.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Change le prix du produit 12 à 14 900 DZD et son coût d’achat à 9 000 DZD.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['inspect_products', 'update_products'],
      exactToolCounts: { update_products: 1 },
      requiredToolInputs: {
        update_products: {
          items: [{ productId: 12, changes: { price: 14_900, purchasePrice: 9_000 } }],
        },
      },
      forbiddenTools: ['propose_product_edit', 'suggest_discount'],
      requiredTerms: ['14 900', '9 000'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-product-create',
    description:
      'Checks duplicates and taxonomy before directly creating one complete canonical product.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée un produit « Perceuse compacte 12 V » de marque Bosch et catégorie Perceuses, prix 12 900 DZD, coût d’achat 8 000 DZD, 5 unités, actif et en stock.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['inspect_products', 'create_product'],
      exactToolCounts: { create_product: 1 },
      requiredToolInputs: {
        create_product: {
          product: {
            title: 'Perceuse compacte 12 V',
            price: 12_900,
            purchasePrice: 8_000,
            inventoryQuantity: 5,
            brandId: 2,
            categoryId: 3,
            active: true,
            inStock: true,
          },
        },
      },
      forbiddenTools: ['propose_product_edit'],
      requiredTerms: ['21', 'perceuse-compacte-12-v'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-product-archive',
    description:
      'Inspects an exact product before archiving it without deleting historical references.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Archive le produit 12 et retire-le du catalogue.', surface: 'products' },
    expectations: {
      requiredTools: ['inspect_products', 'archive_products'],
      exactToolCounts: { archive_products: 1 },
      requiredToolInputs: { archive_products: { productIds: [12] } },
      requiredTerms: ['12'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-product-restore',
    description:
      'Inspects the native archived record before canonical restoration without claiming it becomes sellable.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Restaure le produit archivé 12.', surface: 'products/archive' },
    expectations: {
      requiredTools: ['inspect_archived_products', 'restore_products'],
      forbiddenTools: ['inspect_products', 'archive_products', 'update_products'],
      exactToolCounts: { inspect_archived_products: 1, restore_products: 1 },
      requiredToolInputs: {
        inspect_archived_products: { scope: 'exact', productIds: [12] },
        restore_products: { productIds: [12] },
      },
      requiredTerms: ['12'],
      requiredAnyTerms: [
        ['restauré', 'restaurée'],
        ['inactif', 'inactive', 'désactivé', 'désactivée', 'desactive'],
        ['hors stock', 'pas en stock', 'indisponible', 'out_of_stock'],
      ],
      forbiddenTerms: ['actif et en stock', 'maintenant en vente'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-taxonomy-create',
    description: 'Checks taxonomy matches before directly creating the exact requested brand.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Crée la marque Atelier Pro.', surface: 'brands_categories' },
    expectations: {
      requiredTools: ['find_brands', 'manage_taxonomy'],
      exactToolCounts: { manage_taxonomy: 1 },
      requiredToolInputs: {
        manage_taxonomy: {
          operation: 'create',
          entity: { kind: 'brand', data: { name: 'Atelier Pro' } },
        },
      },
      forbiddenTools: ['propose_brand_create'],
      requiredTerms: ['6', 'atelier-pro'],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-taxonomy-reparent',
    description: 'Resolves the category before directly applying a hierarchy-safe parent change.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Déplace la catégorie 7 sous la catégorie Perceuses (ID 3).',
      surface: 'brands_categories',
    },
    expectations: {
      requiredTools: ['find_categories', 'manage_taxonomy'],
      exactToolCounts: { manage_taxonomy: 1 },
      requiredToolInputs: {
        manage_taxonomy: {
          operation: 'update',
          entity: { kind: 'category', id: 7, changes: { parentId: 3 } },
        },
      },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-background-work',
    description: 'Reads the server-owned queue for background progress.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Où en est mon dernier export produits ?', surface: 'products' },
    expectations: { requiredTools: ['list_background_jobs'] },
  },
  {
    id: 'admin-background-product-export-start',
    description:
      'Reads current product background work before starting one server-owned full-catalog export.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Exporte tous les produits.', surface: 'products' },
    expectations: {
      requiredTools: ['list_background_jobs', 'start_background_job'],
      exactToolCounts: { start_background_job: 1 },
      requiredToolInputs: { start_background_job: { type: 'product_export' } },
      requiredAnyTerms: [['en attente', 'lancé', 'démarré', 'queued']],
      forbiddenTerms: ['déjà terminé', 'fichier est prêt', 'export terminé.'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-storefront-configuration',
    description:
      'Reads complete storefront configuration then changes only explicitly named address, Facebook, and assistant fields.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Remplace l’adresse de la boutique par « 12 rue des Outils, Alger », efface son lien Facebook et désactive son assistant.',
      surface: 'administration/storefront',
    },
    expectations: {
      requiredTools: ['inspect_storefront_configuration', 'update_storefront_settings'],
      exactToolCounts: { inspect_storefront_configuration: 1, update_storefront_settings: 1 },
      requiredToolInputs: {
        update_storefront_settings: {
          operations: [
            { field: 'address', value: '12 rue des Outils, Alger' },
            { field: 'facebookUrl', value: null },
            { field: 'aiAssistantEnabled', value: false },
          ],
        },
      },
      requiredTerms: ['12 rue des Outils', 'Facebook'],
      requiredAnyTerms: [['désactivé', 'désactivée', 'inactif', 'inactive']],
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      passThreshold: 1,
    },
  },
  {
    id: 'admin-storefront-announcement',
    description:
      'Reads the current storefront configuration before applying an explicitly requested bilingual announcement.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Active l’annonce « Livraison offerte ce week-end » / « توصيل مجاني نهاية هذا الأسبوع ».',
      surface: 'administration/storefront',
    },
    expectations: {
      requiredTools: ['inspect_storefront_configuration', 'update_storefront_announcement'],
      exactToolCounts: { update_storefront_announcement: 1 },
      requiredToolInputs: {
        update_storefront_announcement: {
          messageFr: 'Livraison offerte ce week-end',
          messageAr: 'توصيل مجاني نهاية هذا الأسبوع',
          active: true,
        },
      },
      forbiddenTerms: ['proposition', 'proposé', 'proposée'],
      // The response must repeat the requested Arabic copy. Do not penalize that
      // grounded content as a French-language failure.
      passThreshold: 0.95,
    },
  },
];
