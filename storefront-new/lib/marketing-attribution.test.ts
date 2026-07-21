import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildMetaClickCookie,
  captureMarketingAttribution,
  captureStorefrontAttribution,
  getMarketingOrderContext,
  parseGoogleClientId,
  parseGoogleSessionId,
} from './marketing-attribution';

describe('marketing attribution boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const name of ['_fbc', 'bric_visit_id']) document.cookie = `${name}=; Max-Age=0; Path=/`;
    window.history.replaceState({}, '', '/fr/checkout?gclid=g-1&ttclid=tt-1&fbclid=meta-click&utm_source=facebook&utm_medium=paid_social&private=discarded');
    document.cookie = '_ga=GA1.1.12345.67890; path=/';
    document.cookie = '_ttp=ttp-cookie; path=/';
  });

  it('persists an allowlisted first-touch URL, visit id, and Meta click cookie', () => {
    const attribution = captureStorefrontAttribution(1_720_000_000_000);
    expect(attribution).toMatchObject({
      fbclid: 'meta-click',
      fbc: 'fb.1.1720000000.meta-click',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
    });
    expect(attribution.landingUrl).toContain('fbclid=meta-click');
    expect(attribution.landingUrl).not.toContain('private');
    expect(document.cookie).toContain(`_fbc=${encodeURIComponent(attribution.fbc!)}`);
    expect(document.cookie).toContain(`bric_visit_id=${attribution.visitId}`);

    window.history.replaceState({}, '', '/fr/products');
    expect(captureStorefrontAttribution(1_720_000_001_000).visitId).toBe(attribution.visitId);
    expect(buildMetaClickCookie('next-click', 1_720_000_002_000)).toBe('fb.1.1720000002.next-click');
  });

  it('starts a new attributed visit when a new Meta click arrives', () => {
    const first = captureStorefrontAttribution(1_720_000_000_000);
    window.history.replaceState({}, '', '/fr/?fbclid=second-click&utm_source=facebook');
    const second = captureStorefrontAttribution(1_720_000_010_000);
    expect(second.visitId).not.toBe(first.visitId);
    expect(second.fbclid).toBe('second-click');
    expect(document.cookie).toContain(`_fbc=${encodeURIComponent('fb.1.1720000010.second-click')}`);
  });

  it('normalizes GA identifiers without exposing customer fields', () => {
    expect(parseGoogleClientId('GA1.1.12345.67890')).toBe('12345.67890');
    expect(parseGoogleSessionId('GS2.1.s1712345678$o1')).toBe('1712345678');
    expect(parseGoogleClientId('invalid')).toBeNull();
  });

  it('persists paid click identifiers across navigation and builds a strict order context', () => {
    expect(captureMarketingAttribution()).toMatchObject({ gclid: 'g-1', ttclid: 'tt-1' });
    window.history.replaceState({}, '', '/fr/checkout');
    const context = getMarketingOrderContext('purchase-1');
    expect(context).toMatchObject({
      eventId: 'purchase-1',
      google: { clientId: '12345.67890', gclid: 'g-1' },
      tiktok: { clickId: 'tt-1', cookieId: 'ttp-cookie' },
    });
    expect(JSON.stringify(context)).not.toMatch(/phone|email|address/i);
  });
});
