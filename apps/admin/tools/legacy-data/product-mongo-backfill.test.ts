import { describe, expect, it } from 'vitest';

import {
  buildMongoProductTitleIndex,
  normalizeProductTitle,
  planProductMongoBackfill,
} from './product-mongo-backfill';

describe('tools/legacy-data/product-mongo-backfill', () => {
  it('normalizes titles before matching', () => {
    expect(normalizeProductTitle('  Desk   Lamp  ')).toBe('desk lamp');
  });

  it('separates duplicate mongo titles from unique entries', () => {
    const result = buildMongoProductTitleIndex([
      { _id: 'mongo-1', title: 'Desk Lamp' },
      { _id: 'mongo-2', title: 'Desk Lamp' },
      { _id: 'mongo-3', title: 'Office Chair' },
    ]);

    expect(result.uniqueByTitle.get('office chair')).toEqual({
      _id: 'mongo-3',
      title: 'Office Chair',
    });
    expect(result.duplicateMongoTitles).toEqual([
      {
        normalizedTitle: 'desk lamp',
        items: [
          { _id: 'mongo-1', title: 'Desk Lamp' },
          { _id: 'mongo-2', title: 'Desk Lamp' },
        ],
      },
    ]);
  });

  it('plans backfill matches and leaves ambiguous titles unmatched', () => {
    const result = planProductMongoBackfill(
      [
        { id: 1, title: 'Desk Lamp', mongoId: null },
        { id: 2, title: 'Office Chair', mongoId: null },
        { id: 3, title: 'Shelf', mongoId: null },
      ],
      [
        { _id: 'mongo-1', title: 'Desk Lamp' },
        { _id: 'mongo-2', title: 'Desk Lamp' },
        { _id: 'mongo-3', title: 'Office Chair' },
      ],
    );

    expect(result.matches).toEqual([
      {
        productId: 2,
        productTitle: 'Office Chair',
        mongoId: 'mongo-3',
        mongoTitle: 'Office Chair',
        existingMongoId: null,
      },
    ]);
    expect(result.unmatchedPostgres).toEqual([
      { id: 1, title: 'Desk Lamp', mongoId: null },
      { id: 3, title: 'Shelf', mongoId: null },
    ]);
    expect(result.unmatchedMongo).toEqual([
      { _id: 'mongo-1', title: 'Desk Lamp' },
      { _id: 'mongo-2', title: 'Desk Lamp' },
    ]);
  });
});
