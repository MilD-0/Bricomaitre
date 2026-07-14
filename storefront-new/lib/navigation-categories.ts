import { z } from 'zod';

export const navigationCategoriesSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    nameAr: z.string().trim().min(1).nullable(),
  })).max(8),
});

export async function fetchNavigationCategories(signal?: AbortSignal) {
  const response = await fetch('/api/catalog/meta', {
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) return [];
  const parsed = navigationCategoriesSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.items : [];
}
