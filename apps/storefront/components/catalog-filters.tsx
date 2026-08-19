'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import { MobileSheet } from '@/components/mobile-sheet';
import type { Locale } from '@/i18n/config';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

type FilterOption = {
  id: number;
  label: string;
  parentId?: number | null;
  productCount?: number;
};

type CatalogFilterLabels = {
  title: string;
  close: string;
  category: string;
  allCategories: string;
  brand: string;
  allBrands: string;
  discounted?: string;
  stock?: string;
  inStock?: string;
  price?: string;
  minPrice?: string;
  maxPrice?: string;
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
  stock = 'all',
  minPrice = null,
  maxPrice = null,
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
  stock?: 'all' | 'in' | 'out';
  minPrice?: number | null;
  maxPrice?: number | null;
  search: string;
  sort: string;
  labels: CatalogFilterLabels;
}) {
  const fallbackLabels =
    locale === 'ar'
      ? {
          discounted: 'العروض فقط',
          stock: 'التوفر',
          inStock: 'المنتجات المتوفرة فقط',
          price: 'السعر',
          minPrice: 'الأدنى',
          maxPrice: 'الأقصى',
        }
      : {
          discounted: 'Promotions uniquement',
          stock: 'Disponibilité',
          inStock: 'Produits en stock uniquement',
          price: 'Prix',
          minPrice: 'Minimum',
          maxPrice: 'Maximum',
        };
  const filterLabels = { ...fallbackLabels, ...labels };
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formId = `catalog-mobile-filters-${locale}`;
  const activeCount =
    Number(selectedCategory !== null) +
    Number(selectedBrand !== null) +
    Number(discounted) +
    Number(stock !== 'all') +
    Number(minPrice !== null || maxPrice !== null);
  const action = `/${locale}/products`;

  function close() {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function prepareSubmission(event: FormEvent<HTMLFormElement>) {
    for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]:checked',
    )) {
      if (!input.value) input.disabled = true;
    }
    for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>(
      'input[type="range"][data-boundary]',
    )) {
      if (input.value === input.dataset.boundary) input.disabled = true;
    }
    void triggerHaptic('primary');
  }

  const fields = (surface: 'rail' | 'sheet') => (
    <>
      {search ? <input type="hidden" name="q" value={search} /> : null}
      {discounted ? <input type="hidden" name="discounted" value="1" /> : null}
      {sort !== 'recommended' ? <input type="hidden" name="sort" value={sort} /> : null}
      <FilterGroup
        title={labels.category}
        name="category"
        allLabel={labels.allCategories}
        options={categories}
        selected={selectedCategory}
        surface={surface}
      />
      <FilterGroup
        title={labels.brand}
        name="brand"
        allLabel={labels.allBrands}
        options={brands}
        selected={selectedBrand}
        surface={surface}
      />
      <fieldset>
        <legend>{filterLabels.stock}</legend>
        <label className="catalog-filter-checkbox">
          <input type="checkbox" name="stock" value="in" defaultChecked={stock === 'in'} />
          <span>{filterLabels.inStock}</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>{filterLabels.price}</legend>
        <PriceRangeFields
          locale={locale}
          minPrice={minPrice}
          maxPrice={maxPrice}
          minLabel={filterLabels.minPrice}
          maxLabel={filterLabels.maxPrice}
        />
      </fieldset>
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
        onClick={() => {
          void triggerHaptic('surface');
          setOpen(true);
        }}
      >
        <SlidersHorizontal aria-hidden="true" size={18} />
        <span>{labels.title}</span>
        {activeCount > 0 ? (
          <b className="catalog-mobile-filter-count" aria-label={`${activeCount}`}>
            {activeCount}
          </b>
        ) : null}
      </button>

      <div className="catalog-filter-rail">
        <h2>{labels.title}</h2>
        <form action={action} method="get" onSubmit={prepareSubmission}>
          {fields('rail')}
          <FilterActions locale={locale} activeCount={activeCount} labels={labels} />
        </form>
      </div>

      {open ? (
        <MobileSheet
          title={labels.title}
          closeLabel={labels.close}
          className="catalog-filter-sheet"
          onClose={close}
          footer={
            <div className="catalog-filter-sheet-actions">
              <button
                className="button button-primary"
                type="submit"
                form={formId}
                onPointerDown={prepareHaptics}
              >
                {labels.apply}
              </button>
              {activeCount > 0 ? <a href={action}>{labels.reset}</a> : null}
            </div>
          }
        >
          <form
            id={formId}
            className="catalog-filter-sheet-form"
            action={action}
            method="get"
            onSubmit={prepareSubmission}
          >
            {fields('sheet')}
          </form>
        </MobileSheet>
      ) : null}
    </aside>
  );
}

const PRICE_CEILING = 500_000;
const PRICE_STEP = 500;

function PriceRangeFields({
  locale,
  minPrice,
  maxPrice,
  minLabel,
  maxLabel,
}: {
  locale: Locale;
  minPrice: number | null;
  maxPrice: number | null;
  minLabel: string;
  maxLabel: string;
}) {
  const id = useId();
  const [minimum, setMinimum] = useState(Math.min(minPrice ?? 0, PRICE_CEILING - PRICE_STEP));
  const [maximum, setMaximum] = useState(
    Math.min(PRICE_CEILING, Math.max(maxPrice ?? PRICE_CEILING, (minPrice ?? 0) + PRICE_STEP)),
  );
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    maximumFractionDigits: 0,
  });
  const start = (minimum / PRICE_CEILING) * 100;
  const end = (maximum / PRICE_CEILING) * 100;

  return (
    <div
      className="catalog-price-slider"
      style={{ '--price-start': `${start}%`, '--price-end': `${end}%` } as CSSProperties}
    >
      <div className="catalog-price-slider-track">
        <input
          id={`${id}-min`}
          aria-label={minLabel}
          name="minPrice"
          type="range"
          min="0"
          max={PRICE_CEILING}
          step={PRICE_STEP}
          value={minimum}
          data-boundary="0"
          onChange={(event) =>
            setMinimum(Math.min(Number(event.target.value), maximum - PRICE_STEP))
          }
        />
        <input
          id={`${id}-max`}
          aria-label={maxLabel}
          name="maxPrice"
          type="range"
          min="0"
          max={PRICE_CEILING}
          step={PRICE_STEP}
          value={maximum}
          data-boundary={PRICE_CEILING}
          onChange={(event) =>
            setMaximum(Math.max(Number(event.target.value), minimum + PRICE_STEP))
          }
        />
      </div>
      <div className="catalog-price-values" aria-hidden="true">
        <output>{formatter.format(minimum)} DA</output>
        <output>{formatter.format(maximum)} DA</output>
      </div>
    </div>
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
          <input
            type="radio"
            name={name}
            value=""
            defaultChecked={selected === null}
            data-surface={surface}
          />
          <span>{allLabel}</span>
        </label>
        {options.map((option) => (
          <label key={option.id} data-child={option.parentId != null ? 'true' : undefined}>
            <input
              type="radio"
              name={name}
              value={option.id}
              defaultChecked={selected === option.id}
              data-surface={surface}
            />
            <span>
              {option.label}
              {option.productCount !== undefined ? <small>{option.productCount}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterActions({
  locale,
  activeCount,
  labels,
}: {
  locale: Locale;
  activeCount: number;
  labels: CatalogFilterLabels;
}) {
  return (
    <div className="catalog-filter-actions">
      <button
        type="submit"
        className="button button-primary catalog-filter-submit"
        onPointerDown={prepareHaptics}
      >
        {labels.apply}
      </button>
      {activeCount > 0 ? (
        <a href={`/${locale}/products`} className="catalog-reset">
          {labels.reset}
        </a>
      ) : null}
    </div>
  );
}
