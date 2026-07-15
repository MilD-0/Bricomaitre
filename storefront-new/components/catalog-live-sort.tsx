'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { catalogSortValues, type CatalogPageQuery } from '@/lib/catalog-query';

type CatalogSort = CatalogPageQuery['sort'];

export function CatalogLiveSort({
  initialValue,
  label,
  options,
}: {
  initialValue: CatalogSort;
  label: string;
  options: Array<{ value: CatalogSort; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [lastInitialValue, setLastInitialValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  if (initialValue !== lastInitialValue) {
    setLastInitialValue(initialValue);
    setValue(initialValue);
  }

  return (
    <label className="catalog-sort">
      <span>{label}</span>
      <select
        name="sort"
        value={value}
        aria-busy={isPending}
        onChange={(event) => {
          const rawValue = event.currentTarget.value;
          if (!catalogSortValues.some((candidate) => candidate === rawValue)) return;
          const nextValue = rawValue as CatalogSort;

          setValue(nextValue);
          const params = new URLSearchParams(searchParams.toString());
          if (nextValue === 'recommended') params.delete('sort');
          else params.set('sort', nextValue);
          params.delete('page');
          const query = params.toString();
          startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false }));
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
