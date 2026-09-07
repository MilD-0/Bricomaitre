'use client';
import * as React from 'react';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { RemoteProductPicker } from '../remote-product-picker';
import { type AssetsWorkspaceCopy } from './contract';

export function ProductPicker({
  copy,
  selectedIds,
  multiple,
  required,
  onChange,
}: {
  copy: AssetsWorkspaceCopy;
  selectedIds: number[];
  multiple?: boolean;
  required?: boolean;
  onChange: (ids: number[]) => void;
}) {
  return (
    <RemoteProductPicker
      label={copy.products}
      selectedIds={selectedIds}
      multiple={multiple}
      required={required}
      copy={{
        search: copy.productSearch,
        empty: copy.productEmpty,
        selected: copy.selected,
        inactive: copy.inactive,
        remove: copy.remove,
      }}
      onChange={onChange}
    />
  );
}

export function OptionChecklist({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: number; name: string }>;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? options.filter((option) => option.name.toLocaleLowerCase().includes(normalized))
    : options;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <Input
        aria-label={label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={label}
      />
      <div className="grid max-h-44 gap-1 overflow-y-auto border-y border-border/60 py-1 sm:grid-cols-2">
        {filtered.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm"
          >
            <Checkbox
              checked={value.includes(option.id)}
              onChange={() =>
                onChange(
                  value.includes(option.id)
                    ? value.filter((id) => id !== option.id)
                    : [...value, option.id],
                )
              }
            />
            <span className="truncate">{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
