import { describe, expect, it } from 'vitest';

import { drizzleSchemaFiles } from './drizzle.schemas';

describe('Drizzle schema manifest', () => {
  it('includes lifecycle and managed storefront content tables in generated migrations', () => {
    expect(drizzleSchemaFiles).toEqual(
      expect.arrayContaining([
        '../../packages/db/src/schema/productLifecycle.ts',
        '../../packages/db/src/schema/storefrontContent.ts',
      ]),
    );
  });
});
