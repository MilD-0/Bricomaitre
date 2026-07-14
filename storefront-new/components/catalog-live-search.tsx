'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type ConnectionHint = {
  effectiveType?: string;
  saveData?: boolean;
};

export function getAdaptiveSearchDelay(
  value: string,
  inputType = 'insertText',
  connection: ConnectionHint = {},
) {
  const length = [...value.trim()].length;
  let delay = inputType === 'insertFromPaste'
    ? 100
    : inputType.startsWith('delete')
      ? 320
      : length === 0
        ? 180
        : length === 1
          ? 520
          : length === 2
            ? 380
            : 240;

  if (connection.saveData) delay += 180;
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') delay += 220;
  else if (connection.effectiveType === '3g') delay += 80;
  return delay;
}

export function CatalogLiveSearch({
  initialValue,
  label,
  placeholder,
  searchingLabel,
}: {
  initialValue: string;
  label: string;
  placeholder: string;
  searchingLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [lastInitialValue, setLastInitialValue] = useState(initialValue);
  const [committedValue, setCommittedValue] = useState(initialValue);
  const [queued, setQueued] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  if (initialValue !== lastInitialValue) {
    setLastInitialValue(initialValue);
    if (initialValue !== committedValue) setValue(initialValue);
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function schedule(nextValue: string, inputType: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQueued(true);
    const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const normalizedValue = nextValue.trim();
      if (normalizedValue) params.set('q', normalizedValue);
      else params.delete('q');
      params.delete('page');
      setCommittedValue(normalizedValue);
      setQueued(false);
      const query = params.toString();
      startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false }));
    }, getAdaptiveSearchDelay(nextValue, inputType, connection));
  }

  return (
    <label className="catalog-search">
      <span>{label}</span>
      <input
        type="search"
        name="q"
        value={value}
        placeholder={placeholder}
        maxLength={80}
        autoComplete="off"
        aria-label={label}
        aria-busy={queued || isPending}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);
          if (!composingRef.current) {
            schedule(nextValue, (event.nativeEvent as InputEvent).inputType || 'insertText');
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          if (timerRef.current) clearTimeout(timerRef.current);
          setQueued(false);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          schedule(event.currentTarget.value, 'insertCompositionText');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && timerRef.current) clearTimeout(timerRef.current);
        }}
      />
      <small className="catalog-search-status" role="status" aria-live="polite">
        {queued || isPending ? searchingLabel : ''}
      </small>
    </label>
  );
}
