import { describe, expect, it } from 'vitest';

import { classifyAcquisition, isNonDirectAcquisition } from './acquisition';

describe('canonical acquisition classification', () => {
  it.each([
    [{ utmSource: 'facebook', utmMedium: 'paid_social' }, 'meta_paid', 'paid_utm'],
    [{ utmSource: 'ig', utmMedium: 'organic' }, 'meta_organic', 'organic_utm'],
    [{ hasMetaClickId: true }, 'meta_unclassified', 'meta_click_id_only'],
    [{ hasGoogleClickId: true }, 'google_paid', 'google_click_id'],
    [{ referrer: 'https://www.google.com/search?q=tools' }, 'google_organic', 'google_referrer'],
    [{ referrer: 'https://l.facebook.com/' }, 'meta_organic', 'meta_referrer'],
    [{ referrer: 'https://chatgpt.com/' }, 'external_ai', 'external_ai_referrer'],
    [{ utmSource: 'whatsapp' }, 'shared_link', 'explicit_share'],
    [{ referrer: 'https://example.com/article' }, 'other_referral', 'external_referrer'],
    [
      { referrer: 'https://bricomaitre.com/fr/products/a' },
      'direct_dark_social',
      'no_external_referrer',
    ],
  ] as const)('classifies %o as %s', (input, channel, evidence) => {
    expect(classifyAcquisition(input)).toEqual({ channel, evidence });
  });

  it('does not infer paid Meta traffic from fbclid alone', () => {
    expect(
      classifyAcquisition({
        hasMetaClickId: true,
        referrer: 'https://l.facebook.com/',
      }),
    ).toEqual({ channel: 'meta_unclassified', evidence: 'meta_click_id_only' });
  });

  it('prefers an explicit external source over an unrelated retained click signal', () => {
    expect(classifyAcquisition({ utmSource: 'perplexity', hasMetaClickId: true })).toEqual({
      channel: 'external_ai',
      evidence: 'external_ai_source',
    });
  });

  it('keeps direct and malformed referrers out of last-non-direct attribution', () => {
    expect(isNonDirectAcquisition('direct_dark_social')).toBe(false);
    expect(isNonDirectAcquisition('unknown')).toBe(false);
    expect(isNonDirectAcquisition('google_organic')).toBe(true);
    expect(classifyAcquisition({ referrer: 'not a URL' })).toEqual({
      channel: 'unknown',
      evidence: 'invalid_referrer',
    });
  });
});
