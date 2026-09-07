'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
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
  let delay =
    inputType === 'insertFromPaste'
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
  const [queued, setQueued] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  const queryString = searchParams.toString();
  const locationRef = useRef({ pathname, queryString, initialValue });
  const ownNavigations = useRef(new Set<string>());

  useLayoutEffect(() => {
    const previous = locationRef.current;
    locationRef.current = { pathname, queryString, initialValue };
    if (
      previous.pathname === pathname &&
      previous.queryString === queryString &&
      previous.initialValue === initialValue
    )
      return;
    const target = `${pathname}?${queryString}`;
    if (ownNavigations.current.has(target)) {
      // A newer completed search also supersedes earlier navigations that Next
      // cancelled. Those targets must not swallow a later Back/forward action.
      for (const pendingTarget of ownNavigations.current) {
        ownNavigations.current.delete(pendingTarget);
        if (pendingTarget === target) break;
      }
      return;
    }

    // Back/forward and other filters supersede any queued search edit.
    ownNavigations.current.clear();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setQueued(false);
    setValue(initialValue);
  }, [pathname, queryString, initialValue]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function schedule(nextValue: string, inputType: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQueued(true);
    const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
    timerRef.current = setTimeout(
      () => commit(nextValue),
      getAdaptiveSearchDelay(nextValue, inputType, connection),
    );
  }

  function commit(nextValue: string) {
    timerRef.current = null;
    const current = locationRef.current;
    const params = new URLSearchParams(current.queryString);
    const normalizedValue = nextValue.trim();
    if (normalizedValue) params.set('q', normalizedValue);
    else params.delete('q');
    params.delete('page');
    setQueued(false);
    const query = params.toString();
    if (query === current.queryString) return;
    const target = `${current.pathname}?${query}`;
    ownNavigations.current.delete(target);
    ownNavigations.current.add(target);
    startTransition(() =>
      router.replace(`${current.pathname}${query ? `?${query}` : ''}` as Route, { scroll: false }),
    );
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
          if (event.key !== 'Enter' || composingRef.current) return;
          event.preventDefault();
          if (timerRef.current) clearTimeout(timerRef.current);
          commit(event.currentTarget.value);
        }}
      />
      <small className="catalog-search-status" role="status" aria-live="polite">
        {queued || isPending ? searchingLabel : ''}
      </small>
    </label>
  );
}
