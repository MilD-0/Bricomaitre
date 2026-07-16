import { z } from 'zod';

export const navigationMetaSchema = z.object({
  categories: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    nameAr: z.string().trim().min(1).nullable(),
    slug: z.string().trim().min(1).nullable(),
  })).max(128),
  brands: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1).nullable(),
  })).max(128),
});

export async function fetchNavigationMeta(signal?: AbortSignal) {
  const response = await fetch('/api/catalog/meta', {
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) return { categories: [], brands: [] };
  const parsed = navigationMetaSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : { categories: [], brands: [] };
}
