'use client';

/* eslint-disable @next/next/no-img-element -- Product options use admin-configured CDN origins. */

import { Check, Search, X } from 'lucide-react';
import * as React from 'react';

import { requestJson } from '../../lib/admin-api';
import type { AssetProductOption } from '../../lib/assets';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';

type Response = {
  items: AssetProductOption[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function RemoteProductPicker({
  label,
  selectedIds,
  multiple = false,
  required = false,
  copy,
  onChange,
}: {
  label: string;
  selectedIds: number[];
  multiple?: boolean;
  required?: boolean;
  copy: { search: string; empty: string; selected: string; inactive: string; remove: string };
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<AssetProductOption[]>([]);
  const [selected, setSelected] = React.useState<AssetProductOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (selectedIds.length === 0) return;
    const controller = new AbortController();
    void requestJson<Response>(`/api/assets/product-options?ids=${selectedIds.join(',')}`, {
      signal: controller.signal,
    })
      .then((response) => setSelected(response.items))
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== 'AbortError')
          setError(reason instanceof Error ? reason.message : copy.empty);
      });
    return () => controller.abort();
  }, [copy.empty, selectedIds]);

  React.useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ search: query, limit: '12' });
      void requestJson<Response>(`/api/assets/product-options?${params}`, {
        signal: controller.signal,
      })
        .then((response) => setResults(response.items))
        .catch((reason: unknown) => {
          if ((reason as { name?: string }).name !== 'AbortError')
            setError(reason instanceof Error ? reason.message : copy.empty);
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [copy.empty, query]);

  const choose = (option: AssetProductOption) => {
    if (multiple) {
      onChange(
        selectedIds.includes(option.id)
          ? selectedIds.filter((id) => id !== option.id)
          : [...selectedIds, option.id],
      );
      return;
    }
    onChange([option.id]);
  };
  const visibleSelected = selected.filter((option) => selectedIds.includes(option.id));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {label}
        {required ? ' *' : ''}
      </legend>
      {visibleSelected.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={copy.selected}>
          {visibleSelected.map((option) => (
            <button
              key={option.id}
              type="button"
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/25 py-1 pe-2 ps-1 text-xs"
              aria-label={`${copy.remove} ${option.title}`}
              onClick={() => onChange(selectedIds.filter((id) => id !== option.id))}
            >
              {option.imageUrl ? (
                <img src={option.imageUrl} alt="" className="size-6 rounded-full object-cover" />
              ) : (
                <span className="size-6 rounded-full bg-muted" />
              )}
              <span className="max-w-52 truncate">{option.title}</span>
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
        <Input
          aria-label={copy.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          className="ps-9"
        />
      </div>
      <div className="max-h-64 divide-y divide-border/55 overflow-y-auto border-y border-border/60">
        {results.map((option) => {
          const checked = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={checked}
              className={cn(
                'flex w-full items-center gap-3 px-1 py-2.5 text-start transition-colors hover:bg-muted/45',
                checked && 'bg-primary/5',
              )}
              onClick={() => choose(option)}
            >
              {option.imageUrl ? (
                <img src={option.imageUrl} alt="" className="size-10 rounded-md object-cover" />
              ) : (
                <span className="size-10 rounded-md bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{option.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.sku || option.slug}
                  {!option.active ? ` · ${copy.inactive}` : ''}
                </span>
              </span>
              {checked ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {!loading && results.length === 0 ? (
          <p className="px-1 py-4 text-sm text-muted-foreground">{error || copy.empty}</p>
        ) : null}
        {loading ? <p className="px-1 py-4 text-sm text-muted-foreground">…</p> : null}
      </div>
    </fieldset>
  );
}
