'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@/i18n/config';
import { fetchNavigationCategories, type navigationCategoriesSchema } from '@/lib/navigation-categories';
import type { z } from 'zod';

type Category = z.infer<typeof navigationCategoriesSchema>['items'][number];

export function NavigationCategories({ locale }: { locale: Locale }) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNavigationCategories(controller.signal).then(setCategories).catch(() => undefined);
    return () => controller.abort();
  }, []);

  return categories.map((category) => (
    <a key={category.id} href={`/${locale}/products?category=${category.id}`} data-navigation-target={`category:${category.id}`}>
      {locale === 'ar' && category.nameAr ? category.nameAr : category.name}
    </a>
  ));
}
