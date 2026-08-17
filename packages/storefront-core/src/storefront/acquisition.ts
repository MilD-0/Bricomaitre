import { z } from 'zod';

export const acquisitionChannelSchema = z.enum([
  'meta_paid',
  'meta_organic',
  'meta_unclassified',
  'google_paid',
  'google_organic',
  'direct_dark_social',
  'shared_link',
  'external_ai',
  'other_referral',
  'other_campaign',
  'unknown',
]);

export const acquisitionEvidenceSchema = z.enum([
  'paid_utm',
  'organic_utm',
  'meta_click_id_only',
  'google_click_id',
  'tiktok_click_id',
  'meta_source',
  'google_source',
  'meta_referrer',
  'google_referrer',
  'explicit_share',
  'external_ai_source',
  'external_ai_referrer',
  'campaign_utm',
  'external_referrer',
  'no_external_referrer',
  'invalid_referrer',
]);

export type AcquisitionChannel = z.infer<typeof acquisitionChannelSchema>;
export type AcquisitionEvidence = z.infer<typeof acquisitionEvidenceSchema>;

export type AcquisitionClassificationInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
  hasMetaClickId?: boolean;
  hasGoogleClickId?: boolean;
  hasTikTokClickId?: boolean;
};

const META_SOURCES = new Set([
  'an',
  'audience_network',
  'fb',
  'facebook',
  'ig',
  'instagram',
  'messenger',
  'meta',
  'msg',
  'th',
  'threads',
]);
const GOOGLE_SOURCES = new Set(['adwords', 'google', 'google_ads']);
const SHARE_SOURCES = new Set([
  'copy_link',
  'email',
  'messenger_share',
  'shared_link',
  'telegram',
  'whatsapp',
]);
const EXTERNAL_AI_SOURCES = new Set([
  'chatgpt',
  'claude',
  'copilot',
  'gemini',
  'openai',
  'perplexity',
]);
const EXTERNAL_AI_HOSTS = [
  'chatgpt.com',
  'claude.ai',
  'copilot.microsoft.com',
  'gemini.google.com',
  'perplexity.ai',
];

function normalized(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_') || null
  );
}

function isPaidMedium(value: string | null) {
  if (!value) return false;
  return ['cpc', 'cpm', 'cpv', 'paid', 'paid_social', 'ppc', 'social_paid'].some(
    (token) => value === token || value.split(/[_/]+/).includes(token),
  );
}

function isOrganicMedium(value: string | null) {
  return value != null && ['organic', 'organic_social', 'referral', 'social'].includes(value);
}

function isShareMedium(value: string | null) {
  return value != null && ['dark_social', 'share', 'shared', 'shared_link'].includes(value);
}

function referrerHost(value: string | null | undefined) {
  if (!value) return { kind: 'none' as const, host: null };
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return { kind: 'invalid' as const, host: null };
    if (host === 'bricomaitre.com' || host.endsWith('.bricomaitre.com')) {
      return { kind: 'internal' as const, host };
    }
    return { kind: 'external' as const, host };
  } catch {
    return { kind: 'invalid' as const, host: null };
  }
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function classifyAcquisition(input: AcquisitionClassificationInput): {
  channel: AcquisitionChannel;
  evidence: AcquisitionEvidence;
} {
  const source = normalized(input.utmSource);
  const medium = normalized(input.utmMedium);
  const referrer = referrerHost(input.referrer);

  if (META_SOURCES.has(source ?? '') && isPaidMedium(medium)) {
    return { channel: 'meta_paid', evidence: 'paid_utm' };
  }
  if (GOOGLE_SOURCES.has(source ?? '') && isPaidMedium(medium)) {
    return { channel: 'google_paid', evidence: 'paid_utm' };
  }
  if (SHARE_SOURCES.has(source ?? '') || isShareMedium(medium)) {
    return { channel: 'shared_link', evidence: 'explicit_share' };
  }
  if (EXTERNAL_AI_SOURCES.has(source ?? '')) {
    return { channel: 'external_ai', evidence: 'external_ai_source' };
  }
  if (input.hasGoogleClickId) {
    return { channel: 'google_paid', evidence: 'google_click_id' };
  }
  if (input.hasTikTokClickId) {
    return { channel: 'other_campaign', evidence: 'tiktok_click_id' };
  }
  if (META_SOURCES.has(source ?? '') && isOrganicMedium(medium)) {
    return { channel: 'meta_organic', evidence: 'organic_utm' };
  }
  if (input.hasMetaClickId) {
    return { channel: 'meta_unclassified', evidence: 'meta_click_id_only' };
  }
  if (META_SOURCES.has(source ?? '')) {
    return { channel: 'meta_unclassified', evidence: 'meta_source' };
  }
  if (GOOGLE_SOURCES.has(source ?? '')) {
    return { channel: 'google_organic', evidence: 'google_source' };
  }
  if (source || medium) {
    return { channel: 'other_campaign', evidence: 'campaign_utm' };
  }

  if (referrer.kind === 'external' && referrer.host) {
    if (hostMatches(referrer.host, 'facebook.com') || hostMatches(referrer.host, 'instagram.com')) {
      return { channel: 'meta_organic', evidence: 'meta_referrer' };
    }
    if (hostMatches(referrer.host, 'google.com')) {
      return { channel: 'google_organic', evidence: 'google_referrer' };
    }
    if (EXTERNAL_AI_HOSTS.some((domain) => hostMatches(referrer.host!, domain))) {
      return { channel: 'external_ai', evidence: 'external_ai_referrer' };
    }
    return { channel: 'other_referral', evidence: 'external_referrer' };
  }
  if (referrer.kind === 'invalid') {
    return { channel: 'unknown', evidence: 'invalid_referrer' };
  }
  return { channel: 'direct_dark_social', evidence: 'no_external_referrer' };
}

export function isNonDirectAcquisition(channel: AcquisitionChannel) {
  return channel !== 'direct_dark_social' && channel !== 'unknown';
}
