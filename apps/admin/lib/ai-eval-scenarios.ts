import type { AiEvalScenario } from '@bric/ai-core/evals';

export type AdminAiEvalInput = {
  message: string;
  surface: string;
  locale?: 'fr' | 'ar';
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
      forbiddenTools: ['suggest_featured_products'],
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
      forbiddenTools: ['suggest_landing_page'],
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
      forbiddenTools: ['suggest_landing_page'],
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
    id: 'admin-analytics-product-focus',
    description:
      'Uses the canonical catalog product decision dataset instead of accepting the generic dashboard truncation.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Analyse précisément la performance opérationnelle du produit « Perceuse Bosch 18 V » sur les 90 derniers jours : unités postées, unités payées et contribution.',
      surface: 'analytics',
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
        ['taux de planification', 'taux planifié', 'hypothèse de planification'],
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
        ],
        ['ligne pointillée', 'courbe pointillée', 'pointillés', 'valeurs pointillées'],
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
          'pas zéro',
          'pas infini',
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
        [
          'horodatages réels ne changent pas',
          'horodatages réels n’ont pas été déplacés',
          "horodatages réels n'ont pas été déplacés",
          'ne déplace pas les horodatages',
        ],
      ],
      requiredConcepts: [
        [['vendredi'], ['reste', 'conserv'], ['enregistr', 'date réelle', 'horodatage original']],
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
      requiredAnyTerms: [
        ['télémétrie', 'données EcoTrack', 'données du transporteur'],
        ['ne prouve pas', 'pas la preuve', 'ne signifie pas nécessairement', 'pas nécessairement'],
      ],
      requiredConcepts: [
        [['absent', 'manqu', 'indispon', 'non fourni', 'pas transmis', 'aucun détail']],
      ],
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
      forbiddenTools: ['propose_product_edit', 'suggest_discount'],
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
      forbiddenTools: ['propose_product_edit'],
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
      forbiddenTools: ['propose_brand_create'],
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
    },
  },
];
