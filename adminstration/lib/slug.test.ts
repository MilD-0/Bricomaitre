import { describe, expect, it, vi } from 'vitest';

import { createSlugAssigner, resolveUniqueSlug, slugify } from './slug';

describe('lib/slug', () => {
  it('normalizes accented latin text into ascii slugs', () => {
    expect(slugify('Peinture extérieure')).toBe('peinture-exterieure');
    expect(slugify('Électricité & Sécurité')).toBe('electricite-securite');
    expect(slugify('  Œuvre de décoration  ')).toBe('oeuvre-de-decoration');
  });

  it('collapses separators and falls back when no ascii characters remain', () => {
    expect(slugify('A___B///C')).toBe('a-b-c');
    expect(slugify('؟؟؟')).toBe('item');
  });

  it('resolves unique slugs with numeric suffixes', async () => {
    const isTaken = vi
      .fn<(_: string) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(resolveUniqueSlug('Peinture extérieure', isTaken)).resolves.toBe('peinture-exterieure-3');
  });

  it('assigns deterministic unique slugs from an in-memory registry', () => {
    const assignSlug = createSlugAssigner();

    expect(assignSlug('Peinture extérieure')).toBe('peinture-exterieure');
    expect(assignSlug('Peinture exterieure')).toBe('peinture-exterieure-2');
    expect(assignSlug('Peinture extérieure')).toBe('peinture-exterieure-3');
  });
});
