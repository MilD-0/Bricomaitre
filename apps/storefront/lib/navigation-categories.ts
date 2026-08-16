import { z } from 'zod';

export const navigationMetaSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1),
        nameAr: z.string().trim().min(1).nullable(),
        slug: z.string().trim().min(1).nullable(),
        parentId: z.number().int().positive().nullable(),
      }),
    )
    .max(128),
  brands: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1),
        slug: z.string().trim().min(1).nullable(),
      }),
    )
    .max(128),
});

type NavigationMeta = z.infer<typeof navigationMetaSchema>;
const EMPTY_NAVIGATION_META: NavigationMeta = { categories: [], brands: [] };
let navigationMetaPromise: Promise<NavigationMeta> | null = null;

export async function fetchNavigationMeta(signal?: AbortSignal) {
  if (!navigationMetaPromise) {
    navigationMetaPromise = fetch('/api/catalog/meta', {
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return EMPTY_NAVIGATION_META;
        const parsed = navigationMetaSchema.safeParse(await response.json());
        return parsed.success ? parsed.data : EMPTY_NAVIGATION_META;
      })
      .catch(() => {
        navigationMetaPromise = null;
        return EMPTY_NAVIGATION_META;
      });
  }

  if (!signal) return navigationMetaPromise;
  if (signal.aborted) throw new DOMException('Navigation metadata request aborted', 'AbortError');

  return Promise.race([
    navigationMetaPromise,
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Navigation metadata request aborted', 'AbortError')),
        { once: true },
      );
    }),
  ]);
}
