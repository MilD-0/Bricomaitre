import { describe, expect, it } from 'vitest';

import {
  getMarketingDestinationConfiguration,
  mergeMarketingDestinationConfiguration,
} from './marketing-diagnostics';

describe('marketing destination diagnostics', () => {
  it('reports explicitly enabled and disabled optional destinations', () => {
    expect(
      getMarketingDestinationConfiguration({
        MARKETING_GOOGLE_DESTINATION_ENABLED: 'true',
        MARKETING_TIKTOK_DESTINATION_ENABLED: 'false',
      }),
    ).toEqual({ google: 'enabled', tiktok: 'disabled' });
  });

  it('does not claim a configuration state when deployment evidence is absent or invalid', () => {
    expect(
      getMarketingDestinationConfiguration({
        MARKETING_GOOGLE_DESTINATION_ENABLED: '',
        MARKETING_TIKTOK_DESTINATION_ENABLED: 'sometimes',
      }),
    ).toEqual({ google: 'unknown', tiktok: 'unknown' });
  });

  it('keeps historical disabled-destination counts while making current state explicit', () => {
    const destinations = mergeMarketingDestinationConfiguration(
      [
        {
          destination: 'tiktok',
          queued: 0,
          processing: 0,
          accepted: 0,
          duplicated: 0,
          rejected: 132,
          retrying: 0,
          exhausted: 1617,
          dropped: 0,
          oldestPendingAt: null,
          lastAcceptedAt: null,
        },
      ],
      { google: 'enabled', tiktok: 'disabled' },
    );

    expect(destinations).toEqual([
      expect.objectContaining({
        destination: 'google',
        configuration: 'enabled',
        accepted: 0,
      }),
      expect.objectContaining({
        destination: 'tiktok',
        configuration: 'disabled',
        rejected: 132,
        exhausted: 1617,
      }),
    ]);
  });
});
