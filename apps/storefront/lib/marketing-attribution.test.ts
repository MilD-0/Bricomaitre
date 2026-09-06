import { buildMetaClickCookie } from '@bric/storefront-core/meta-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureMarketingAttribution,
  captureStorefrontAttribution,
  getMarketingOrderContext,
  getStorefrontAnalyticsContext,
  parseGoogleClientId,
  parseGoogleSessionId,
} from './marketing-attribution';

describe('marketing attribution boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    for (const name of ['_fbc', 'bric_visit_id']) document.cookie = `${name}=; Max-Age=0; Path=/`;
    window.history.replaceState(
      {},
      '',
      '/fr/checkout?gclid=g-1&ttclid=tt-1&fbclid=meta-click&utm_source=facebook&utm_medium=paid_social&private=discarded',
    );
    document.cookie = '_ga=GA1.1.12345.67890; path=/';
    document.cookie = '_ttp=ttp-cookie; path=/';
  });

  it('persists an allowlisted first-touch URL, visit id, and Meta click cookie', () => {
    const attribution = captureStorefrontAttribution(1_720_000_000_000);
    expect(attribution).toMatchObject({
      fbclid: 'meta-click',
      fbc: 'fb.1.1720000000000.meta-click',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
    });
    expect(attribution.landingUrl).toContain('fbclid=meta-click');
    expect(attribution.landingUrl).not.toContain('private');
    expect(document.cookie).toContain(`_fbc=${encodeURIComponent(attribution.fbc!)}`);
    expect(document.cookie).toContain(`bric_visit_id=${attribution.visitId}`);

    window.history.replaceState({}, '', '/fr/products');
    expect(captureStorefrontAttribution(1_720_000_001_000).visitId).toBe(attribution.visitId);
    expect(buildMetaClickCookie('next-click', 1_720_000_002_000)).toBe(
      'fb.1.1720000002000.next-click',
    );
  });

  it('starts a new attributed visit when a new Meta click arrives', () => {
    const first = captureStorefrontAttribution(1_720_000_000_000);
    window.history.replaceState({}, '', '/fr/?fbclid=second-click&utm_source=facebook');
    const second = captureStorefrontAttribution(1_720_000_010_000);
    expect(second.visitId).not.toBe(first.visitId);
    expect(second.fbclid).toBe('second-click');
    expect(document.cookie).toContain(
      `_fbc=${encodeURIComponent('fb.1.1720000010000.second-click')}`,
    );
  });

  it('starts a new source-less campaign visit for platform click identifiers', () => {
    window.history.replaceState({}, '', '/fr/?fbclid=first-click&utm_source=facebook');
    const first = captureStorefrontAttribution(1_720_000_000_000);

    window.history.replaceState({}, '', '/fr/products?gclid=google-click');
    const second = captureStorefrontAttribution(1_720_000_010_000);

    expect(second).toMatchObject({
      landingUrl: expect.stringContaining('/fr/products?gclid=google-click'),
      utmSource: null,
      capturedAt: 1_720_000_010_000,
    });
    expect(second.visitId).not.toBe(first.visitId);
  });

  it('uses a real 30-minute inactivity session and preserves its immutable entry', () => {
    const first = getStorefrontAnalyticsContext(1_720_000_000_000);
    window.history.replaceState({}, '', '/fr/products');
    const active = getStorefrontAnalyticsContext(1_720_001_700_000);
    const expired = getStorefrontAnalyticsContext(1_720_003_600_001);

    expect(active.sessionId).toBe(first.sessionId);
    expect(active.entry.landingPath).toBe('/fr/checkout');
    expect(expired.sessionId).not.toBe(first.sessionId);
    expect(expired.entry.landingPath).toBe('/fr/products');
  });

  it('starts a new session for a new campaign and retains a seven-day last non-direct touch', () => {
    const first = getStorefrontAnalyticsContext(1_720_000_000_000);
    window.history.replaceState({}, '', '/fr/products?utm_source=google&utm_medium=organic');
    const google = getStorefrontAnalyticsContext(1_720_000_010_000);
    window.history.replaceState({}, '', '/fr/products');
    const direct = getStorefrontAnalyticsContext(1_720_002_000_001);

    expect(google.sessionId).not.toBe(first.sessionId);
    expect(google.classification.channel).toBe('google_organic');
    expect(direct.sessionId).not.toBe(google.sessionId);
    expect(direct.classification.channel).toBe('direct_dark_social');
    expect(direct.lastNonDirectTouch).toMatchObject({
      sessionId: google.sessionId,
      utmSource: 'google',
    });
  });

  it.each([false, true])(
    'retains one journey, session and visit when storage writes fail (reads denied: %s)',
    (denyReads) => {
      const getItem = denyReads
        ? vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Denied', 'SecurityError');
          })
        : null;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError');
      });
      try {
        const first = { ...captureStorefrontAttribution(), ...getStorefrontAnalyticsContext() };
        getMarketingOrderContext('purchase-storage-denied');
        const second = { ...captureStorefrontAttribution(), ...getStorefrontAnalyticsContext() };
        expect(first.journeyId).toBe(second.journeyId);
        expect(first.sessionId).toBe(second.sessionId);
        expect(first.visitId).toBe(second.visitId);
        expect(first.journeyId).toBeTruthy();
        expect(first.sessionId).toBeTruthy();
        expect(first.visitId).toBeTruthy();
      } finally {
        getItem?.mockRestore();
        setItem.mockRestore();
      }
    },
  );

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
      sessionEntry: {
        landingPath: '/fr/checkout',
        utmSource: 'facebook',
      },
      lastNonDirectTouch: {
        landingPath: '/fr/checkout',
        utmSource: 'facebook',
      },
      acquisition: {
        landingPath: '/fr/checkout',
        utmSource: 'facebook',
        utmMedium: 'paid_social',
      },
      google: { clientId: '12345.67890', gclid: 'g-1' },
      tiktok: { clickId: 'tt-1', cookieId: 'ttp-cookie' },
    });
    expect(JSON.stringify(context.acquisition)).not.toContain('meta-click');
    expect(JSON.stringify(context)).not.toMatch(/phone|email|address/i);
  });

  it.each(['_ga', '_fbc', '_ttp'])(
    'ignores malformed %s cookies when building an order',
    (name) => {
      window.history.replaceState({}, '', '/ar/landing/motor-holder');
      document.cookie = `${name}=%ZZ; Path=/`;
      expect(getMarketingOrderContext('purchase-cookie')).toMatchObject({
        eventId: 'purchase-cookie',
        eventSourceUrl: window.location.href,
      });
      document.cookie = `${name}=; Max-Age=0; Path=/`;
    },
  );

  it('bounds encoded Arabic campaign URLs while retaining the landing path and click identity', () => {
    const query = new URLSearchParams({
      fbclid: 'x'.repeat(250),
      utm_source: 'fb',
      utm_campaign: 'حملة'.repeat(40),
      utm_content: 'عرض'.repeat(50),
    });
    window.history.replaceState({}, '', `/ar/landing/motor-holder?${query}`);
    expect(window.location.href.length).toBeGreaterThan(2048);
    const context = getMarketingOrderContext('purchase-long-url');
    expect(context.eventSourceUrl.length).toBeLessThanOrEqual(2048);
    expect(new URL(context.eventSourceUrl).pathname).toBe('/ar/landing/motor-holder');
    expect(new URL(context.eventSourceUrl).searchParams.get('fbclid')).toBe('x'.repeat(250));
    expect(context.acquisition?.utmContent).toBe('عرض'.repeat(50));
    expect(captureStorefrontAttribution().landingUrl.length).toBeLessThanOrEqual(2048);
    expect(getStorefrontAnalyticsContext().sessionId).toBeTruthy();
  });
});
