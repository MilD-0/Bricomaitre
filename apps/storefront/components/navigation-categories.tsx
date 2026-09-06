'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '@/i18n/config';
import { useNavigationMeta } from '@/components/use-navigation-meta';
import { getBrandPath, getCategoryPath } from '@/lib/taxonomy-routes';

export function NavigationCategories({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { categories: string; brands: string; loadError: string; retry: string };
}) {
  const { meta, loading, failed, retry } = useNavigationMeta();
  const [openMenu, setOpenMenu] = useState<'categories' | 'brands' | null>(null);
  const navigationRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (failed)
    return (
      <span className="navigation-load-error" role="status">
        {labels.loadError}{' '}
        <button type="button" onClick={retry}>
          {labels.retry}
        </button>
      </span>
    );

  if (loading)
    return (
      <span className="navigation-categories-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );

  return (
    <span ref={navigationRef} className="site-navigation-menus">
      {meta.categories.length ? (
        <div className="site-navigation-menu">
          <button
            className="site-navigation-menu-trigger"
            type="button"
            aria-expanded={openMenu === 'categories'}
            aria-controls="site-navigation-categories"
            onClick={() =>
              setOpenMenu((current) => (current === 'categories' ? null : 'categories'))
            }
          >
            {labels.categories}
          </button>
          {openMenu === 'categories' ? (
            <div id="site-navigation-categories" className="site-navigation-menu-panel">
              {meta.categories.map((category) => (
                <a
                  key={category.id}
                  href={getCategoryPath(locale, category)}
                  data-navigation-target={`category:${category.id}`}
                >
                  {locale === 'ar' && category.nameAr ? category.nameAr : category.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {meta.brands.length ? (
        <div className="site-navigation-menu">
          <button
            className="site-navigation-menu-trigger"
            type="button"
            aria-expanded={openMenu === 'brands'}
            aria-controls="site-navigation-brands"
            onClick={() => setOpenMenu((current) => (current === 'brands' ? null : 'brands'))}
          >
            {labels.brands}
          </button>
          {openMenu === 'brands' ? (
            <div id="site-navigation-brands" className="site-navigation-menu-panel">
              {meta.brands.map((brand) => (
                <a
                  key={brand.id}
                  href={getBrandPath(locale, brand)}
                  data-navigation-target={`brand:${brand.id}`}
                >
                  {brand.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
