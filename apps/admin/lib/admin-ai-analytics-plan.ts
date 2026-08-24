import type { AdminAiSurfaceContext } from './admin-ai-context';
import type { AdminAiAnalyticsContinuation } from './admin-ai-conversation-context';
import {
  adminAiAnalyticsDatasetSpecs,
  adminAiAnalyticsFocusSupportsSelectors,
  type AdminAiAnalyticsFocusDimension,
} from './admin-ai-analytics-focus';
import type { Analytics2Grain, Analytics2Range, Analytics2View } from './analytics2';

export type AdminAiAnalyticsQueryPlan = {
  view: Analytics2View;
  range: Analytics2Range;
  startDate?: string;
  endDate?: string;
  grain?: Analytics2Grain;
  focus?: {
    dimension: AdminAiAnalyticsFocusDimension;
    search?: string;
    identifiers?: string[];
    limit?: number;
  };
  additionalQueries?: Array<{
    view: Analytics2View;
    focus?: {
      dimension: AdminAiAnalyticsFocusDimension;
      search?: string;
      identifiers?: string[];
      limit?: number;
    };
    reason: string;
  }>;
  maxQueries: 1 | 2 | 3;
  reason: string;
};

const viewValues = new Set<Analytics2View>([
  'command',
  'money',
  'acquisition',
  'fulfillment',
  'storefront',
  'search',
  'catalog',
  'assumptions',
]);
const rangeValues = new Set<Analytics2Range>(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']);
const grainValues = new Set<Analytics2Grain>(['auto', 'day', 'week', 'month']);

function normalized(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[’]/g, "'");
}

function includesAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term));
}

export function asksAdminAiAnalyticsQuestion(rawMessage: string) {
  const message = normalized(rawMessage);
  return includesAny(message, [
    'analytics',
    'analytique',
    'statistique',
    'stats',
    'kpi',
    'metrique',
    'performance',
    'performing',
    'performe',
    'performent',
    'performant',
    'profit',
    'rentabilite',
    'revenu',
    "chiffre d'affaires",
    'conversion',
    'taux de retour',
    'return rate',
    'contribution payee',
    'paid contribution',
    'profit x',
    'cpm',
    'ctr',
    'cout par',
    'cost per',
    'cout operationnel',
    'couts operationnels',
    'cout mensuel',
    'charge mensuelle',
    'operating cost',
    'taux de change',
    'fx',
    'override quotidien',
    'daily override',
    'vendredi',
    'friday',
    'synchronise meta',
    'synchronisation meta',
    'synchronization meta',
    'sync meta',
    'تكلفة تشغيلية',
    'تكاليف تشغيلية',
    'معدل الإرجاع',
    'سعر الصرف',
    'تجاوز يومي',
    'search console',
    'seo',
    'session',
    'cohorte',
    'cohort',
    'prevision',
    'forecast',
    'projection',
    'tendance',
    'trend',
    'evolution',
    'مبيعات',
    'تحليلات',
    'إحصائيات',
    'احصائيات',
    'ربح',
    'تحويل',
    'جلسات',
  ]);
}

export function isAdminAiAnalyticsContinuationMessage(rawMessage: string) {
  const message = normalized(rawMessage);
  if (message.startsWith('why') || message.startsWith('pourquoi') || message.startsWith('لماذا')) {
    return true;
  }
  return includesAny(message, [
    'why?',
    'why did',
    'why has',
    'how come',
    'explain that',
    'explain this',
    'compare that',
    'compare this',
    'break that down',
    'break this down',
    'break it down',
    'go deeper',
    'same metric',
    'same period',
    'same range',
    'same campaign',
    'same product',
    'and last month',
    'and this month',
    'what about',
    'and by ',
    'pourquoi ?',
    'pourquoi a',
    'pourquoi est',
    'explique cela',
    'explique ça',
    'explique ca',
    'compare cela',
    'compare ça',
    'compare ca',
    'decompose cela',
    'décompose cela',
    'va plus loin',
    'meme metrique',
    'même métrique',
    'meme periode',
    'même période',
    'meme campagne',
    'même campagne',
    'meme produit',
    'même produit',
    'et le mois dernier',
    "qu'en est-il",
    'et par ',
    'لماذا',
    'اشرح ذلك',
    'قارن ذلك',
    'نفس الفترة',
    'نفس الحملة',
    'نفس المنتج',
  ]);
}

function refersToCurrentSelection(message: string) {
  return includesAny(message, [
    'this chart',
    'this table',
    'this campaign',
    'this product',
    'this page',
    'these campaigns',
    'these products',
    'these rows',
    'current chart',
    'current selection',
    'selected',
    'shown',
    'ce graphique',
    'ce tableau',
    'cette campagne',
    'ce produit',
    'cette page',
    'ces campagnes',
    'ces produits',
    'ces lignes',
    'selection',
    'element affiche',
    'ligne affichee',
    'ici',
    'هذا',
    'هذه',
    'هؤلاء',
    'المحدد',
    'المعروض',
  ]);
}

function splitContextIdentifiers(value: unknown) {
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

function activeContextFocus(context: AdminAiSurfaceContext | undefined, view: Analytics2View) {
  const rawDimension = context?.filters.analyticsFocus;
  if (typeof rawDimension === 'string') {
    const dimension = rawDimension as AdminAiAnalyticsFocusDimension;
    const spec = adminAiAnalyticsDatasetSpecs[dimension];
    if (spec?.views.includes(view)) {
      const search = context?.filters.analyticsSearch;
      const identifiers = splitContextIdentifiers(context?.filters.analyticsIdentifiers);
      return {
        dimension,
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(identifiers.length ? { identifiers } : {}),
      };
    }
  }

  const selection = context?.selection;
  if (
    view === 'catalog' &&
    (selection?.entityType === 'product' || selection?.entityType === 'inventoryProduct')
  ) {
    return { dimension: 'products' as const, identifiers: selection.ids.map(String) };
  }
  if (view === 'storefront' && selection?.entityType === 'landingPage') {
    return { dimension: 'landing_pages' as const, identifiers: selection.ids.map(String) };
  }
  return null;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateInAlgiers(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function previousCalendarMonth(endDate: string) {
  const currentMonthStart = `${endDate.slice(0, 8)}01`;
  const previousEnd = addCalendarDays(currentMonthStart, -1);
  return { startDate: `${previousEnd.slice(0, 8)}01`, endDate: previousEnd };
}

const frenchMonths: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

function explicitDateRange(message: string) {
  const isoDates = [...message.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (isoDates.length >= 2) return { startDate: isoDates[0], endDate: isoDates[1] };

  const french = message.match(
    /\b(?:du|de)\s+(\d{1,2})(?:er)?\s+(?:au|a)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/,
  );
  if (!french) return null;
  const month = frenchMonths[french[3]];
  if (!month) return null;
  const year = Number(french[4]);
  const startDay = Number(french[1]);
  const endDay = Number(french[2]);
  if (startDay < 1 || endDay < startDay || endDay > 31) return null;
  return {
    startDate: `${year}-${pad(month)}-${pad(startDay)}`,
    endDate: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

function rangePlan(
  message: string,
  context: AdminAiSurfaceContext | undefined,
  now: Date,
  previous?: AdminAiAnalyticsContinuation,
): Pick<AdminAiAnalyticsQueryPlan, 'range' | 'startDate' | 'endDate' | 'grain'> {
  const dates = explicitDateRange(message);
  if (dates) return { range: 'custom', ...dates };
  if (includesAny(message, ['90 derniers jours', 'last 90 days', 'اخر 90', 'آخر 90'])) {
    return { range: '90d' };
  }
  if (includesAny(message, ['30 derniers jours', 'last 30 days', 'اخر 30', 'آخر 30'])) {
    return { range: '30d' };
  }
  if (includesAny(message, ['14 derniers jours', 'last 14 days', 'اخر 14', 'آخر 14'])) {
    return { range: '14d' };
  }
  if (includesAny(message, ['7 derniers jours', 'last 7 days', 'اخر 7', 'آخر 7'])) {
    return { range: '7d' };
  }
  if (includesAny(message, ['ce mois', 'this month', 'هذا الشهر'])) {
    const endDate = dateInAlgiers(now);
    return { range: 'custom', startDate: `${endDate.slice(0, 8)}01`, endDate };
  }
  if (includesAny(message, ['mois dernier', 'last month', 'الشهر الماضي'])) {
    return { range: 'custom', ...previousCalendarMonth(dateInAlgiers(now)) };
  }
  if (includesAny(message, ["aujourd'hui", 'today', 'اليوم'])) {
    const date = dateInAlgiers(now);
    return { range: 'custom', startDate: date, endDate: date, grain: 'day' };
  }
  if (includesAny(message, ['hier', 'yesterday', 'أمس'])) {
    const date = addCalendarDays(dateInAlgiers(now), -1);
    return { range: 'custom', startDate: date, endDate: date, grain: 'day' };
  }
  if (
    includesAny(message, ["depuis le debut de l'annee", 'year to date', 'ytd', 'منذ بداية السنة'])
  ) {
    const endDate = dateInAlgiers(now);
    return { range: 'custom', startDate: `${endDate.slice(0, 4)}-01-01`, endDate };
  }

  const contextRange = context?.surface === 'stats' ? context.filters.range : undefined;
  const range =
    typeof contextRange === 'string' && rangeValues.has(contextRange as Analytics2Range)
      ? (contextRange as Analytics2Range)
      : previous && rangeValues.has(previous.range as Analytics2Range)
        ? (previous.range as Analytics2Range)
        : '30d';
  const grainValue = context?.surface === 'stats' ? context.filters.grain : undefined;
  const grain =
    typeof grainValue === 'string' && grainValues.has(grainValue as Analytics2Grain)
      ? (grainValue as Analytics2Grain)
      : previous?.grain && grainValues.has(previous.grain as Analytics2Grain)
        ? (previous.grain as Analytics2Grain)
        : undefined;
  if (range !== 'custom') return { range, ...(grain ? { grain } : {}) };
  const startDate = context?.surface === 'stats' ? context.filters.startDate : previous?.startDate;
  const endDate = context?.surface === 'stats' ? context.filters.endDate : previous?.endDate;
  return typeof startDate === 'string' && typeof endDate === 'string'
    ? { range, startDate, endDate, ...(grain ? { grain } : {}) }
    : { range: '30d', ...(grain ? { grain } : {}) };
}

function contextView(context: AdminAiSurfaceContext | undefined) {
  if (context?.surface !== 'stats') return null;
  const filterView = context?.filters.view;
  if (typeof filterView === 'string' && viewValues.has(filterView as Analytics2View)) {
    return filterView as Analytics2View;
  }
  const section = context?.section;
  return typeof section === 'string' && viewValues.has(section as Analytics2View)
    ? (section as Analytics2View)
    : null;
}

function explicitlyComparedViews(message: string, primaryView: Analytics2View) {
  if (!includesAny(message, ['compare', 'croise', 'cross', 'combine'])) return [];
  const detailedAcquisition = includesAny(message, [
    'campagne',
    'campaign',
    'ad set',
    'adset',
    'acquisition payante',
    'cpm',
    'ctr',
    'tracking',
    'creative',
  ]);
  const candidates: Array<[Analytics2View, boolean, string]> = [
    [
      'search',
      includesAny(message, ['search console', 'seo', 'recherche organique']),
      'Search owns organic visibility.',
    ],
    [
      'acquisition',
      (primaryView !== 'money' || detailedAcquisition) &&
        includesAny(message, ['meta', 'campagne', 'campaign', 'acquisition payante']),
      'Acquisition owns Meta spend and attribution.',
    ],
    [
      'storefront',
      includesAny(message, ['storefront', 'boutique', 'session', 'web vital']),
      'Storefront owns first-party sessions and conversion.',
    ],
    [
      'fulfillment',
      includesAny(message, [
        'expedition',
        'livraison',
        'shipment',
        'delivery attempt',
        'tentative de livraison',
      ]),
      'Fulfillment owns shipment outcomes.',
    ],
    [
      'catalog',
      includesAny(message, ['catalogue', 'catalog', 'produit', 'product', 'client', 'customer']),
      'Catalog owns product and customer decisions.',
    ],
    [
      'money',
      includesAny(message, ['profit', 'contribution payee', 'rentabilite']),
      'Money owns comparable profit meanings.',
    ],
    [
      'assumptions',
      includesAny(message, ['hypothese', 'planification', 'cout operationnel', 'operating cost']),
      'Assumptions owns planning inputs.',
    ],
  ];
  return candidates
    .filter(([view, selected]) => selected && view !== primaryView)
    .slice(0, 2)
    .map(([view, , reason]) => ({ view, reason }));
}

function diagnosticQueries(message: string, primaryView: Analytics2View) {
  const asksForDrivers = includesAny(message, [
    'why',
    'pourquoi',
    'cause',
    'driver',
    'explique',
    'diagnose',
    'diagnostic',
    'baisse',
    'chute',
    'fell',
    'drop',
    'انخفاض',
    'لماذا',
  ]);
  const asksAboutProfit = includesAny(message, ['profit', 'rentabilite', 'contribution', 'ربح']);
  if (!asksForDrivers || !asksAboutProfit || primaryView !== 'money') return [];
  return [
    {
      view: 'acquisition' as const,
      reason: 'Acquisition supplies comparable Meta efficiency without causal overclaiming.',
    },
    {
      view: 'fulfillment' as const,
      reason: 'Fulfillment supplies posting-cohort maturity and paid/return outcomes.',
    },
  ];
}

export function planAdminAiAnalyticsQuery(input: {
  message: string;
  context?: AdminAiSurfaceContext;
  now?: Date;
  previous?: AdminAiAnalyticsContinuation | null;
}): AdminAiAnalyticsQueryPlan {
  const message = normalized(input.message);
  const continuation =
    input.previous && isAdminAiAnalyticsContinuationMessage(message) ? input.previous : null;
  let view: Analytics2View;
  let focus: AdminAiAnalyticsQueryPlan['focus'];
  let reason: string;

  if (
    includesAny(message, [
      'search console',
      'position moyenne',
      'organic search',
      'recherche organique',
      'seo',
    ])
  ) {
    view = 'search';
    if (includesAny(message, ['sitemap', 'plan de site'])) focus = { dimension: 'search_sitemaps' };
    else if (includesAny(message, ['indexation', 'indexing', 'index issue'])) {
      focus = { dimension: 'search_index_issues' };
    } else if (includesAny(message, ['appareil', 'device', 'mobile', 'desktop'])) {
      focus = { dimension: 'search_devices' };
    } else if (includesAny(message, ['pays', 'country'])) {
      focus = { dimension: 'search_countries' };
    } else if (includesAny(message, ['apparence', 'appearance', 'rich result'])) {
      focus = { dimension: 'search_appearances' };
    } else if (includesAny(message, ['requete', 'query', 'opportunite', 'opportunity'])) {
      focus = { dimension: 'search_opportunities' };
    } else if (includesAny(message, ['page', 'url'])) {
      focus = { dimension: 'search_pages' };
    } else if (includesAny(message, ['position', 'tendance', 'trend', 'evolution'])) {
      focus = { dimension: 'search_trend' };
    }
    reason = 'Search Console owns organic visibility and average position.';
  } else if (
    includesAny(message, ['taux de retour observe', 'retour observe', 'observed return']) &&
    includesAny(message, ['planification', 'projection', 'hypothese', 'planning'])
  ) {
    view = 'assumptions';
    reason = 'Assumptions owns planning-versus-observed return policy.';
  } else if (includesAny(message, ['vendredi', 'friday', 'الجمعة'])) {
    view = 'money';
    focus = { dimension: 'friday_weeks' };
    reason = 'Money owns Friday calculator accounting.';
  } else if (
    includesAny(message, [
      'synchronise meta',
      'synchronisation meta',
      'sync meta',
      'meta sync',
      'synchronization meta',
    ])
  ) {
    view = 'acquisition';
    reason = 'Acquisition owns Meta reporting coverage and synchronization results.';
  } else if (
    includesAny(message, [
      'tentative de livraison',
      'tentatives de livraison',
      'delivery attempt',
      'محاولة توصيل',
    ])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'attempt_outcomes' };
    reason = 'Fulfillment owns EcoTrack delivery-attempt telemetry.';
  } else if (
    includesAny(message, ['funnel', 'entonnoir']) &&
    includesAny(message, ['session', 'boutique', 'storefront', 'vue produit', 'product view'])
  ) {
    view = 'storefront';
    focus = { dimension: 'storefront_funnel' };
    reason = 'Storefront owns its distinct-session demand funnel.';
  } else if (
    includesAny(message, [
      'taux de livraison',
      'delivery rate',
      'taux paye',
      'paid rate',
      'commandes payees',
      'paid orders',
      'commandes retournees',
      'returned orders',
    ])
  ) {
    view = 'fulfillment';
    focus = {
      dimension: includesAny(message, ['tendance', 'trend', 'evolution'])
        ? 'fulfillment_trend'
        : 'cash_pipeline',
    };
    reason = 'Fulfillment owns comparable delivery, return, and payment outcomes.';
  } else if (includesAny(message, ['ensemble de publicites', 'ad set', 'adset'])) {
    view = 'acquisition';
    focus = { dimension: 'adsets' };
    reason = 'Acquisition owns exact Meta ad-set attribution.';
  } else if (includesAny(message, ['campagne', 'campaign'])) {
    view = 'acquisition';
    focus = { dimension: 'campaigns' };
    reason = 'Acquisition owns exact Meta campaign attribution.';
  } else if (includesAny(message, ['meta ad', 'publicite meta', 'annonce meta'])) {
    view = 'acquisition';
    focus = { dimension: 'ads' };
    reason = 'Acquisition owns exact Meta ad attribution.';
  } else if (
    includesAny(message, ['courbe pointillee', 'ligne pointillee', 'dotted', 'prevision']) &&
    includesAny(message, ['profit', 'econom', 'collapse', 'effondrement'])
  ) {
    view = 'money';
    focus = { dimension: 'forecast' };
    reason = 'Money owns modeled profit forecasts.';
  } else if (
    includesAny(message, ['maturation']) &&
    includesAny(message, ['attribution', 'meta'])
  ) {
    view = 'acquisition';
    focus = { dimension: 'attribution_maturation' };
    reason = 'Acquisition owns captured Meta attribution maturation.';
  } else if (includesAny(message, ['cpm', 'ctr', 'creative fatigue', 'fatigue creative'])) {
    view = 'acquisition';
    focus = { dimension: 'meta_daily' };
    reason = 'Acquisition owns Meta creative-delivery diagnostics.';
  } else if (includesAny(message, ['tracking health', 'sante du tracking', 'tracking event'])) {
    view = 'acquisition';
    focus = { dimension: 'tracking_events' };
    reason = 'Acquisition owns Meta tracking-event health.';
  } else if (
    includesAny(message, ['entonnoir payant', 'paid funnel', 'funnel payant']) ||
    (message.includes('impression') && message.includes('paid'))
  ) {
    view = 'acquisition';
    focus = { dimension: 'paid_funnel' };
    reason = 'Acquisition owns the Meta-to-paid stage funnel.';
  } else if (
    includesAny(message, ['acquisition payante', 'canaux payants', 'paid acquisition']) ||
    (message.includes('meta') && message.includes('ecotrack'))
  ) {
    view = 'acquisition';
    reason = 'Acquisition owns common-range paid-acquisition analysis.';
  } else if (
    includesAny(message, [
      'commande soumise',
      'commandes soumises',
      'submitted',
      'livree',
      'delivered',
      'الطلبات المقدمة',
      'الطلبات المسلمة',
      'المدفوعة',
    ]) &&
    includesAny(message, ['payee', 'paid', 'مدفوعة', 'livree', 'delivered', 'مسلمة'])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'cash_pipeline' };
    reason = 'Fulfillment owns the submitted-to-paid lifecycle pipeline.';
  } else if (
    includesAny(message, ['etat expedition', 'shipment state', 'statut ecotrack', 'untracked'])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'shipment_states' };
    reason = 'Fulfillment owns effective EcoTrack shipment states.';
  } else if (
    includesAny(message, ['cohorte', 'cohort']) &&
    includesAny(message, ['livraison', 'delivery', 'retour', 'return', 'paiement', 'paid'])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'posting_cohorts' };
    reason = 'Fulfillment owns the maturity of original posting cohorts.';
  } else if (
    includesAny(message, ['prevision', 'forecast', 'projection']) &&
    includesAny(message, ['commande', 'order', 'confirmee', 'confirmed', 'soumise', 'submitted'])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'leading_forecast' };
    reason = 'Fulfillment owns modeled conversion of pending demand.';
  } else if (
    includesAny(message, ['tendance livraison', 'fulfillment trend', 'evolution livraison'])
  ) {
    view = 'fulfillment';
    focus = { dimension: 'fulfillment_trend' };
    reason = 'Fulfillment owns shipment-outcome trends.';
  } else if (includesAny(message, ['profit', 'contribution payee', 'profit x', 'rentabilite'])) {
    view = 'money';
    if (includesAny(message, ['evolution', 'tendance', 'trend', 'timeline', 'ledger'])) {
      focus = {
        dimension: message.includes('contribution payee') ? 'paid_timeline' : 'economics_timeline',
      };
    } else if (includesAny(message, ['cohorte', 'cohort'])) {
      focus = { dimension: 'posting_cohorts' };
    }
    reason = 'Money owns profit definitions and comparable economics.';
  } else if (
    includesAny(message, [
      'cout operationnel',
      'couts operationnels',
      'operating cost',
      'depense fixe',
      'monthly burn',
      'cout mensuel',
      'charge mensuelle',
      'تكلفة تشغيلية',
      'تكاليف تشغيلية',
    ])
  ) {
    view = 'assumptions';
    focus = { dimension: 'operating_costs' };
    reason = 'Assumptions owns operating costs and their effective periods.';
  } else if (
    includesAny(message, ['taux de change', 'fx', 'eur vers dzd', 'eur to dzd', 'سعر الصرف'])
  ) {
    view = 'assumptions';
    reason = 'Assumptions owns the manual snapshotted DZD/EUR rate.';
  } else if (
    includesAny(message, ['override', 'remplacement manuel', 'hypothese quotidienne', 'تجاوز يومي'])
  ) {
    view = 'assumptions';
    focus = { dimension: 'daily_assumptions' };
    reason = 'Assumptions owns daily calculator overrides.';
  } else if (
    includesAny(message, [
      'session',
      'conversion boutique',
      'storefront',
      'landing page',
      'web vital',
      'parcours boutique',
      'storefront path',
      'checkout session',
      'cart session',
    ])
  ) {
    view = 'storefront';
    if (includesAny(message, ['landing page'])) focus = { dimension: 'landing_pages' };
    else if (includesAny(message, ['web vital', 'lcp', 'cls', 'inp'])) {
      focus = { dimension: 'web_vitals' };
    } else if (includesAny(message, ['entonnoir', 'funnel', 'cart session', 'checkout session'])) {
      focus = { dimension: 'storefront_funnel' };
    } else if (includesAny(message, ['parcours', 'path', 'navigation'])) {
      focus = { dimension: 'storefront_paths' };
    } else if (includesAny(message, ['recherche boutique', 'onsite search'])) {
      focus = { dimension: 'storefront_searches' };
    } else if (includesAny(message, ['source', 'referer', 'referrer'])) {
      focus = { dimension: 'storefront_sources' };
    } else if (includesAny(message, ['assistant'])) {
      focus = { dimension: 'storefront_assistant' };
    } else if (includesAny(message, ['produit', 'product'])) {
      focus = { dimension: 'storefront_products' };
    } else if (includesAny(message, ['tendance', 'trend', 'evolution'])) {
      focus = { dimension: 'storefront_trend' };
    }
    reason = 'Storefront owns first-party sessions and conversion telemetry.';
  } else if (
    includesAny(message, [
      'produit',
      'product',
      'catalogue',
      'catalog',
      'client',
      'customer',
      'wilaya',
      'commune',
      'panier',
      'basket',
    ])
  ) {
    view = 'catalog';
    if (includesAny(message, ['panier', 'basket', 'achetes ensemble', 'bought together'])) {
      focus = { dimension: 'basket_pairs' };
    } else if (includesAny(message, ['commune'])) {
      focus = { dimension: 'communes' };
    } else if (includesAny(message, ['region meta', 'meta region'])) {
      focus = { dimension: 'meta_regions' };
    } else if (includesAny(message, ['wilaya'])) {
      focus = { dimension: 'wilayas' };
    } else {
      focus = {
        dimension: includesAny(message, ['client', 'customer']) ? 'customers' : 'products',
      };
    }
    reason = 'Catalog owns product and customer decision economics.';
  } else {
    const previousView =
      continuation && viewValues.has(continuation.view as Analytics2View)
        ? (continuation.view as Analytics2View)
        : null;
    view = contextView(input.context) ?? previousView ?? 'command';
    reason = contextView(input.context)
      ? 'The active Analytics workspace owns this unspecialized question.'
      : previousView
        ? 'The latest canonical Analytics result owns this conversational follow-up.'
        : 'Command is the canonical executive cross-section.';
  }

  const contextualFocus = activeContextFocus(input.context, view);
  if (contextualFocus && refersToCurrentSelection(message)) {
    if (!focus) focus = contextualFocus;
    else if (focus.dimension === contextualFocus.dimension) {
      focus = { ...focus, ...contextualFocus, dimension: focus.dimension };
    }
  }

  if (continuation?.focus && isAdminAiAnalyticsContinuationMessage(message)) {
    const dimension = continuation.focus.dimension as AdminAiAnalyticsFocusDimension;
    if (adminAiAnalyticsDatasetSpecs[dimension]?.views.includes(view)) {
      const previousFocus = {
        dimension,
        ...(continuation.focus.search ? { search: continuation.focus.search } : {}),
        ...(continuation.focus.identifiers?.length
          ? { identifiers: continuation.focus.identifiers }
          : {}),
        ...(continuation.focus.limit ? { limit: continuation.focus.limit } : {}),
      };
      if (!focus) focus = previousFocus;
      else if (focus.dimension === dimension) {
        focus = { ...previousFocus, ...focus, dimension };
      }
    }
  }

  const range = rangePlan(
    message,
    input.context,
    input.now ?? new Date(),
    continuation ?? undefined,
  );
  const additionalQueries = [
    ...diagnosticQueries(message, view),
    ...explicitlyComparedViews(message, view),
  ]
    .filter(
      (query, index, rows) =>
        query.view !== view &&
        rows.findIndex((candidate) => candidate.view === query.view) === index,
    )
    .slice(0, 2);
  return {
    view,
    ...range,
    ...(focus ? { focus } : {}),
    ...(additionalQueries.length ? { additionalQueries } : {}),
    maxQueries: 1,
    reason,
  };
}

export function adminAiAnalyticsPlanMessage(plan: AdminAiAnalyticsQueryPlan) {
  return [
    'Application-owned canonical Analytics query plan for this request:',
    JSON.stringify(plan),
    'Use the primary view/range/focus fields in the tool input. When focus is absent, omit it because the requested headline comparison is already in the view metrics. When focus is present, you may add an exact entity search or identifiers from the operator wording, but do not replace the planned workspace or focus with a conventional ecommerce guess. If additionalQueries are present, the application retrieves those canonical views in parallel inside the same tool call; do not make extra exploratory calls.',
  ].join(' ');
}

function inputRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Applies the trusted application plan to the first model-authored query while
 * preserving useful entity selectors. This ensures the actual retrieval—not
 * merely the prompt—uses Bricomaitre's canonical information architecture.
 */
export function applyAdminAiAnalyticsQueryPlan(raw: unknown, plan: AdminAiAnalyticsQueryPlan) {
  const input = inputRecord(raw);
  const rawFocus = inputRecord(input.focus);
  const rawGrain =
    typeof input.grain === 'string' && grainValues.has(input.grain as Analytics2Grain)
      ? (input.grain as Analytics2Grain)
      : 'auto';
  const supportsSelectors = plan.focus
    ? adminAiAnalyticsFocusSupportsSelectors(plan.focus.dimension)
    : false;
  const focus = plan.focus
    ? {
        dimension: plan.focus.dimension,
        ...(plan.focus.search
          ? { search: plan.focus.search }
          : supportsSelectors && typeof rawFocus.search === 'string'
            ? { search: rawFocus.search }
            : {}),
        ...(plan.focus.identifiers?.length
          ? { identifiers: plan.focus.identifiers }
          : supportsSelectors && Array.isArray(rawFocus.identifiers)
            ? { identifiers: rawFocus.identifiers }
            : {}),
        ...(plan.focus.limit
          ? { limit: plan.focus.limit }
          : typeof rawFocus.limit === 'number'
            ? { limit: rawFocus.limit }
            : {}),
      }
    : undefined;
  return {
    view: plan.view,
    range: plan.range,
    ...(plan.startDate ? { startDate: plan.startDate } : {}),
    ...(plan.endDate ? { endDate: plan.endDate } : {}),
    grain: plan.grain ?? rawGrain,
    ...(focus ? { focus } : {}),
  };
}

export function adminAiAnalyticsQueriesForPlan(raw: unknown, plan: AdminAiAnalyticsQueryPlan) {
  const primary = applyAdminAiAnalyticsQueryPlan(raw, plan);
  const shared = { ...primary };
  delete shared.focus;
  return [
    primary,
    ...(plan.additionalQueries ?? []).map((query) => ({
      ...shared,
      view: query.view,
      ...(query.focus ? { focus: query.focus } : {}),
    })),
  ];
}
