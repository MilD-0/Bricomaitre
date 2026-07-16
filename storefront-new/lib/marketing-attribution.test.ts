import { beforeEach, describe, expect, it } from 'vitest';

import {
  captureMarketingAttribution,
  getMarketingOrderContext,
  parseGoogleClientId,
  parseGoogleSessionId,
} from './marketing-attribution';

describe('marketing attribution boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/fr/checkout?gclid=g-1&ttclid=tt-1');
    document.cookie = '_ga=GA1.1.12345.67890; path=/';
    document.cookie = '_ttp=ttp-cookie; path=/';
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
