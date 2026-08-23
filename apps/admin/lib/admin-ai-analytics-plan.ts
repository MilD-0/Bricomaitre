import type { AdminAiSurfaceContext } from './admin-ai-context';
import type { AdminAiAnalyticsFocusDimension } from './admin-ai-analytics-focus';
import type { Analytics2Grain, Analytics2Range, Analytics2View } from './analytics2';

export type AdminAiAnalyticsQueryPlan = {
  view: Analytics2View;
  range: Analytics2Range;
  startDate?: string;
  endDate?: string;
  grain?: Analytics2Grain;
  focus?: { dimension: AdminAiAnalyticsFocusDimension };
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

  const contextRange = context?.filters.range;
  const range =
    typeof contextRange === 'string' && rangeValues.has(contextRange as Analytics2Range)
      ? (contextRange as Analytics2Range)
      : '30d';
  const grainValue = context?.filters.grain;
  const grain =
    typeof grainValue === 'string' && grainValues.has(grainValue as Analytics2Grain)
      ? (grainValue as Analytics2Grain)
      : undefined;
  if (range !== 'custom') return { range, ...(grain ? { grain } : {}) };
  const startDate = context?.filters.startDate;
  const endDate = context?.filters.endDate;
  return typeof startDate === 'string' && typeof endDate === 'string'
    ? { range, startDate, endDate, ...(grain ? { grain } : {}) }
    : { range: '30d', ...(grain ? { grain } : {}) };
}

function contextView(context: AdminAiSurfaceContext | undefined) {
  const section = context?.section;
  return typeof section === 'string' && viewValues.has(section as Analytics2View)
    ? (section as Analytics2View)
    : null;
}

function explicitWorkspaceCount(message: string) {
  const workspaces = [
    includesAny(message, ['search console', 'seo', 'recherche organique']),
    includesAny(message, ['meta', 'campagne', 'campaign', 'acquisition payante']),
    includesAny(message, ['storefront', 'boutique', 'session', 'web vital']),
    includesAny(message, [
      'expedition',
      'livraison',
      'shipment',
      'delivery attempt',
      'tentative de livraison',
    ]),
    includesAny(message, ['catalogue', 'catalog', 'produit', 'product', 'client', 'customer']),
    includesAny(message, ['profit', 'contribution payee', 'rentabilite']),
    includesAny(message, ['hypothese', 'planification', 'cout operationnel', 'operating cost']),
  ].filter(Boolean).length;
  return Math.min(Math.max(workspaces, 1), 3) as 1 | 2 | 3;
}

export function planAdminAiAnalyticsQuery(input: {
  message: string;
  context?: AdminAiSurfaceContext;
  now?: Date;
}): AdminAiAnalyticsQueryPlan {
  const message = normalized(input.message);
  let view: Analytics2View;
  let focus: AdminAiAnalyticsFocusDimension | undefined;
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
    focus = includesAny(message, ['position', 'tendance', 'trend']) ? 'search_trend' : undefined;
    reason = 'Search Console owns organic visibility and average position.';
  } else if (
    includesAny(message, ['taux de retour observe', 'retour observe', 'observed return']) &&
    includesAny(message, ['planification', 'projection', 'hypothese', 'planning'])
  ) {
    view = 'assumptions';
    reason = 'Assumptions owns planning-versus-observed return policy.';
  } else if (includesAny(message, ['vendredi', 'friday', 'الجمعة'])) {
    view = 'money';
    focus = 'friday_weeks';
    reason = 'Money owns Friday calculator accounting.';
  } else if (
    includesAny(message, [
      'tentative de livraison',
      'tentatives de livraison',
      'delivery attempt',
      'محاولة توصيل',
    ])
  ) {
    view = 'fulfillment';
    focus = 'attempt_outcomes';
    reason = 'Fulfillment owns EcoTrack delivery-attempt telemetry.';
  } else if (includesAny(message, ['campagne', 'campaign'])) {
    view = 'acquisition';
    focus = 'campaigns';
    reason = 'Acquisition owns exact Meta campaign attribution.';
  } else if (includesAny(message, ['ensemble de publicites', 'ad set', 'adset'])) {
    view = 'acquisition';
    focus = 'adsets';
    reason = 'Acquisition owns exact Meta ad-set attribution.';
  } else if (
    includesAny(message, ['courbe pointillee', 'ligne pointillee', 'dotted', 'prevision']) &&
    includesAny(message, ['profit', 'econom', 'collapse', 'effondrement'])
  ) {
    view = 'money';
    focus = 'forecast';
    reason = 'Money owns modeled profit forecasts.';
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
    focus = 'cash_pipeline';
    reason = 'Fulfillment owns the submitted-to-paid lifecycle pipeline.';
  } else if (includesAny(message, ['profit', 'contribution payee', 'profit x', 'rentabilite'])) {
    view = 'money';
    reason = 'Money owns profit definitions and comparable economics.';
  } else if (
    includesAny(message, [
      'session',
      'conversion boutique',
      'storefront',
      'landing page',
      'web vital',
    ])
  ) {
    view = 'storefront';
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
    ])
  ) {
    view = 'catalog';
    focus = includesAny(message, ['client', 'customer']) ? 'customers' : 'products';
    reason = 'Catalog owns product and customer decision economics.';
  } else {
    view = contextView(input.context) ?? 'command';
    reason = contextView(input.context)
      ? 'The active Analytics workspace owns this unspecialized question.'
      : 'Command is the canonical executive cross-section.';
  }

  return {
    view,
    ...rangePlan(message, input.context, input.now ?? new Date()),
    ...(focus ? { focus: { dimension: focus } } : {}),
    maxQueries: explicitWorkspaceCount(message),
    reason,
  };
}

export function adminAiAnalyticsPlanMessage(plan: AdminAiAnalyticsQueryPlan) {
  return [
    'Application-owned canonical Analytics query plan for this request:',
    JSON.stringify(plan),
    'Use these view/range/focus fields in the first query. When focus is absent, omit it because the requested headline comparison is already in the view metrics. When focus is present, you may add an exact entity search or identifiers from the operator wording, but do not replace the planned workspace or focus with a conventional ecommerce guess.',
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
  const focus = plan.focus
    ? {
        dimension: plan.focus.dimension,
        ...(typeof rawFocus.search === 'string' ? { search: rawFocus.search } : {}),
        ...(Array.isArray(rawFocus.identifiers) ? { identifiers: rawFocus.identifiers } : {}),
        ...(typeof rawFocus.limit === 'number' ? { limit: rawFocus.limit } : {}),
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
