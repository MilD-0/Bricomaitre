import { classifyAcquisition, isNonDirectAcquisition } from '../acquisition';
import {
  ORDER_ACQUISITION_SEMANTICS_VERSION,
  ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
  type StorefrontAcquisitionTouch,
  type StorefrontOrderMarketing,
} from '../marketing-contracts';
import { type MetaCommerceLine } from '../meta';
import { normalizeIdentifier } from './payloads';

function normalizeCampaignIdentifier(value: string | null | undefined) {
  const normalized = normalizeIdentifier(value);
  return normalized && /^\d{6,30}$/.test(normalized) ? normalized : null;
}

export function buildOrderAcquisitionSnapshot(
  marketing: StorefrontOrderMarketing,
  context: { hasMetaClick?: boolean; now?: Date } = {},
) {
  const legacy = marketing.acquisition;
  const legacyTouch: StorefrontAcquisitionTouch | null = legacy
    ? {
        sessionId: 'legacy',
        journeyId: 'legacy',
        landingPath: legacy.landingPath,
        referrer: null,
        utmSource: legacy.utmSource,
        utmMedium: legacy.utmMedium,
        utmCampaign: legacy.utmCampaign,
        utmTerm: legacy.utmTerm,
        utmContent: legacy.utmContent,
        hasMetaClickId: context.hasMetaClick === true,
        hasGoogleClickId: Boolean(
          marketing.google?.gclid || marketing.google?.gbraid || marketing.google?.wbraid,
        ),
        hasTikTokClickId: Boolean(marketing.tiktok?.clickId),
        capturedAt: legacy.capturedAt,
      }
    : null;
  const sessionTouch = marketing.sessionEntry ?? legacyTouch;
  if (!sessionTouch) return null;

  const sessionClassification = classifyAcquisition(sessionTouch);
  const now = context.now ?? new Date();
  const lastNonDirect = marketing.lastNonDirectTouch;
  const lastClassification = lastNonDirect ? classifyAcquisition(lastNonDirect) : null;
  const lastCapturedAt = lastNonDirect ? Date.parse(lastNonDirect.capturedAt) : Number.NaN;
  const eligibleLastNonDirect = Boolean(
    lastNonDirect &&
    lastClassification &&
    isNonDirectAcquisition(lastClassification.channel) &&
    lastCapturedAt <= now.getTime() &&
    lastCapturedAt >= now.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const attributedTouch = eligibleLastNonDirect ? lastNonDirect! : sessionTouch;
  const attributedClassification = eligibleLastNonDirect
    ? lastClassification!
    : sessionClassification;
  const source = normalizeIdentifier(attributedTouch.utmSource)?.toLowerCase() ?? null;
  const medium = normalizeIdentifier(attributedTouch.utmMedium)?.toLowerCase() ?? null;
  const channel = attributedClassification.channel;

  let referrerDomain: string | null = null;
  if (attributedTouch.referrer) {
    try {
      referrerDomain = new URL(attributedTouch.referrer).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      referrerDomain = null;
    }
  }

  return {
    semanticsVersion: ORDER_ACQUISITION_SEMANTICS_VERSION,
    attributionModel: 'last_non_direct_7d',
    channel,
    evidence: attributedClassification.evidence,
    sessionChannel: sessionClassification.channel,
    sessionEvidence: sessionClassification.evidence,
    sourceSessionId: attributedTouch.sessionId === 'legacy' ? null : attributedTouch.sessionId,
    referrerDomain,
    sessionStartedAt: new Date(sessionTouch.capturedAt),
    landingPath: attributedTouch.landingPath,
    utmSource: source,
    utmMedium: medium,
    utmCampaign: attributedTouch.utmCampaign ?? null,
    utmTerm: attributedTouch.utmTerm ?? null,
    utmContent: attributedTouch.utmContent ?? null,
    metaCampaignId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmCampaign) : null,
    metaAdsetId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmTerm) : null,
    metaAdId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmContent) : null,
    capturedAt: new Date(attributedTouch.capturedAt),
  };
}

export function buildOrderAiInfluenceSnapshot(input: {
  marketing: StorefrontOrderMarketing;
  orderSessionId: string | null;
  lines: MetaCommerceLine[];
  now: Date;
}) {
  const assistant = input.marketing.assistant;
  const capturedAt = assistant ? new Date(assistant.capturedAt) : input.now;
  const current =
    assistant &&
    capturedAt.getTime() <= input.now.getTime() &&
    capturedAt.getTime() >= input.now.getTime() - 24 * 60 * 60 * 1000;
  if (!current || !assistant) {
    return {
      semanticsVersion: ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
      level: 'none',
      sameSession: false,
      sourceSessionId: null,
      openedAt: null,
      engagedAt: null,
      recommendationClickedAt: null,
      clickedProductIds: [],
      recommendedProductOrdered: false,
      capturedAt: input.now,
    };
  }

  const clickedProductIds = [...new Set(assistant.clickedProductIds)];
  const orderedProductIds = new Set(input.lines.map((line) => line.productId));
  const recommendedProductOrdered = clickedProductIds.some((id) => orderedProductIds.has(id));
  const level = recommendedProductOrdered
    ? 'recommended_product_ordered'
    : assistant.recommendationClickedAt
      ? 'recommendation_clicked'
      : assistant.engagedAt
        ? 'engaged'
        : assistant.openedAt
          ? 'opened'
          : 'none';
  return {
    semanticsVersion: ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
    level,
    sameSession: Boolean(
      input.orderSessionId && assistant.sourceSessionId === input.orderSessionId,
    ),
    sourceSessionId: assistant.sourceSessionId,
    openedAt: assistant.openedAt ? new Date(assistant.openedAt) : null,
    engagedAt: assistant.engagedAt ? new Date(assistant.engagedAt) : null,
    recommendationClickedAt: assistant.recommendationClickedAt
      ? new Date(assistant.recommendationClickedAt)
      : null,
    clickedProductIds,
    recommendedProductOrdered,
    capturedAt,
  };
}
