import { Search } from 'lucide-react';

import { cn } from '../lib/utils';
import { Input } from './ui/input';

export function SearchField({
  value,
  onChange,
  placeholder,
  label = placeholder,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('relative block w-full min-w-0', className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="ps-9"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
