'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { MobileSheet } from '@/components/mobile-sheet';
import type { Locale } from '@/i18n/config';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

type FilterOption = { id: number; label: string };

type CatalogFilterLabels = {
  title: string;
  close: string;
  category: string;
  allCategories: string;
  brand: string;
  allBrands: string;
  apply: string;
  reset: string;
};

export function CatalogFilters({
  locale,
  categories,
  brands,
  selectedCategory,
  selectedBrand,
  discounted,
  search,
  sort,
  labels,
}: {
  locale: Locale;
  categories: FilterOption[];
  brands: FilterOption[];
  selectedCategory: number | null;
  selectedBrand: number | null;
  discounted: boolean;
  search: string;
  sort: string;
  labels: CatalogFilterLabels;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formId = `catalog-mobile-filters-${locale}`;
  const activeCount = Number(selectedCategory !== null) + Number(selectedBrand !== null) + Number(discounted);
  const action = `/${locale}/products`;

  function close() {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function prepareSubmission(event: FormEvent<HTMLFormElement>) {
    for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')) {
      if (!input.value) input.disabled = true;
    }
    void triggerHaptic('primary');
  }

  const fields = (surface: 'rail' | 'sheet') => (
    <>
      {search ? <input type="hidden" name="q" value={search} /> : null}
      {discounted ? <input type="hidden" name="discounted" value="1" /> : null}
      {sort !== 'recommended' ? <input type="hidden" name="sort" value={sort} /> : null}
      <FilterGroup title={labels.category} name="category" allLabel={labels.allCategories} options={categories} selected={selectedCategory} surface={surface} />
      <FilterGroup title={labels.brand} name="brand" allLabel={labels.allBrands} options={brands} selected={selectedBrand} surface={surface} />
    </>
  );

  return (
    <aside className="catalog-filters">
      <button
        ref={triggerRef}
        className="catalog-mobile-filter-button"
        type="button"
        aria-expanded={open}
        onPointerDown={prepareHaptics}
        onClick={() => { void triggerHaptic('surface'); setOpen(true); }}
      >
        <SlidersHorizontal aria-hidden="true" size={18} />
        <span>{labels.title}</span>
        {activeCount > 0 ? <b className="catalog-mobile-filter-count" aria-label={`${activeCount}`}>{activeCount}</b> : null}
      </button>

      <div className="catalog-filter-rail">
        <h2>{labels.title}</h2>
        <form action={action} method="get" onSubmit={prepareSubmission}>
          {fields('rail')}
          <FilterActions locale={locale} activeCount={activeCount} labels={labels} />
        </form>
      </div>

      {open ? (
        <MobileSheet title={labels.title} closeLabel={labels.close} className="catalog-filter-sheet" onClose={close} footer={(
          <div className="catalog-filter-sheet-actions">
            <button className="button button-primary" type="submit" form={formId} onPointerDown={prepareHaptics}>{labels.apply}</button>
            {activeCount > 0 ? <a href={action}>{labels.reset}</a> : null}
          </div>
        )}>
          <form id={formId} className="catalog-filter-sheet-form" action={action} method="get" onSubmit={prepareSubmission}>
            {fields('sheet')}
          </form>
        </MobileSheet>
      ) : null}
    </aside>
  );
}

function FilterGroup({
  title,
  name,
  allLabel,
  options,
  selected,
  surface,
}: {
  title: string;
  name: 'category' | 'brand';
  allLabel: string;
  options: FilterOption[];
  selected: number | null;
  surface: 'rail' | 'sheet';
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <div className="catalog-filter-options">
        <label>
          <input type="radio" name={name} value="" defaultChecked={selected === null} data-surface={surface} />
          <span>{allLabel}</span>
        </label>
        {options.map((option) => (
          <label key={option.id}>
            <input type="radio" name={name} value={option.id} defaultChecked={selected === option.id} data-surface={surface} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterActions({ locale, activeCount, labels }: { locale: Locale; activeCount: number; labels: CatalogFilterLabels }) {
  return (
    <div className="catalog-filter-actions">
      <button type="submit" className="button button-primary catalog-filter-submit" onPointerDown={prepareHaptics}>{labels.apply}</button>
      {activeCount > 0 ? <a href={`/${locale}/products`} className="catalog-reset">{labels.reset}</a> : null}
    </div>
  );
}
