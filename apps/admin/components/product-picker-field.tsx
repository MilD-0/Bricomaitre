'use client';

/* eslint-disable @next/next/no-img-element -- Picker thumbnails can come from legacy arbitrary origins and are not page-critical media. */

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Field, FieldLabel } from './ui/field';
import { Input } from './ui/input';

export type ProductPickerItem = {
  id: number;
  label: string;
  imageUrl?: string | null;
  description?: string | null;
};

export function ProductPickerField({
  label,
  items,
  selectedId,
  searchPlaceholder,
  emptyLabel,
  clearable = false,
  onChange,
}: {
  label: string;
  items: ProductPickerItem[];
  selectedId: number | null;
  searchPlaceholder: string;
  emptyLabel: string;
  clearable?: boolean;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations('assetsManager');
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query) ?? false),
    );
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
        />
        <div className="flex flex-wrap gap-2">
          {selectedItem ? (
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium"
              aria-label={t('removeSelection', { name: selectedItem.label })}
              onClick={() => onChange(null)}
            >
              {selectedItem.label}
            </button>
          ) : (
            <Badge variant="outline">{t('nothingSelected')}</Badge>
          )}
          {clearable && selectedItem ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              {t('clear')}
            </Button>
          ) : null}
        </div>
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto overscroll-contain">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const selected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={
                    selected
                      ? t('removeSelection', { name: item.label })
                      : t('chooseSelection', { name: item.label })
                  }
                  className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => onChange(selected ? null : item.id)}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.label}
                      className="size-16 rounded-xl bg-white object-contain"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
                      {t('noImage')}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-5 text-foreground">{item.label}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={selected ? 'default' : 'outline'}>
                    {selected ? t('selected') : t('choose')}
                  </Badge>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </div>
    </Field>
  );
}
