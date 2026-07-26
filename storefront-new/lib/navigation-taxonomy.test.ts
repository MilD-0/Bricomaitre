import { describe, expect, it } from 'vitest';

import { buildNavigationTaxonomy } from './navigation-taxonomy';

describe('buildNavigationTaxonomy', () => {
  it('keeps only roots at the first level and nests every descendant', () => {
    expect(buildNavigationTaxonomy([
      { id: 1, label: 'Tools', slug: 'tools', parentId: null },
      { id: 2, label: 'Power tools', slug: 'power-tools', parentId: 1 },
      { id: 3, label: 'Drills', slug: 'drills', parentId: 2 },
      { id: 4, label: 'Lighting', slug: 'lighting', parentId: null },
    ])).toEqual([
      {
        id: 1,
        label: 'Tools',
        slug: 'tools',
        parentId: null,
        children: [{
          id: 2,
          label: 'Power tools',
          slug: 'power-tools',
          parentId: 1,
          children: [{ id: 3, label: 'Drills', slug: 'drills', parentId: 2, children: [] }],
        }],
      },
      { id: 4, label: 'Lighting', slug: 'lighting', parentId: null, children: [] },
    ]);
  });

  it('keeps orphaned and cyclic categories navigable without recursing forever', () => {
    const result = buildNavigationTaxonomy([
      { id: 1, label: 'Orphan', parentId: 99 },
      { id: 2, label: 'Cycle A', parentId: 3 },
      { id: 3, label: 'Cycle B', parentId: 2 },
    ]);

    expect(result.map((category) => category.id)).toEqual([1, 2]);
    expect(result[1].children[0]).toMatchObject({ id: 3, children: [] });
  });
});
