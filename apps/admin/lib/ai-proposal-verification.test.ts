import { describe, expect, it } from 'vitest';

import { persistedProposalValuesMatch } from './ai-proposal-verification';

describe('AI proposal persistence verification', () => {
  it('accepts a row only when every proposed value was persisted', () => {
    expect(
      persistedProposalValuesMatch(
        { id: 4, name: 'Power tools', parentId: 2, featured: true },
        { name: 'Power tools', parentId: 2, featured: true },
      ),
    ).toBe(true);
  });

  it('rejects missing rows and partial or mismatched writes', () => {
    expect(persistedProposalValuesMatch(undefined, { active: false })).toBe(false);
    expect(persistedProposalValuesMatch({ active: true }, { active: false })).toBe(false);
    expect(
      persistedProposalValuesMatch({ title: 'Drill' }, { title: 'Drill', titleAr: 'مثقاب' }),
    ).toBe(false);
  });

  it('compares arrays and JSON values structurally', () => {
    expect(
      persistedProposalValuesMatch(
        { images: ['a', 'b'], metadata: { source: 'ai', locale: 'fr' } },
        { images: ['a', 'b'], metadata: { locale: 'fr', source: 'ai' } },
      ),
    ).toBe(true);
    expect(persistedProposalValuesMatch({ images: ['a'] }, { images: ['b'] })).toBe(false);
  });
});
