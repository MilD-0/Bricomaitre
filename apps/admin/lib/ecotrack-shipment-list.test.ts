import { describe, expect, it } from 'vitest';

import { parseEcotrackShipmentListQuery } from './ecotrack-shipment-list';

describe('EcoTrack shipment list query', () => {
  it('rejects unsupported sort fields', () => {
    expect(() => parseEcotrackShipmentListQuery({ sort: ['totalAmount:desc'] })).toThrow(/sort/i);
  });
});
