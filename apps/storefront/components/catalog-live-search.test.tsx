import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogLiveSearch, getAdaptiveSearchDelay } from './catalog-live-search';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/fr/products',
  useSearchParams: () => new URLSearchParams('brand=2&page=3'),
}));

describe('CatalogLiveSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses adaptive delays for intent, input length, and weak connections', () => {
    expect(getAdaptiveSearchDelay('p')).toBe(520);
    expect(getAdaptiveSearchDelay('per')).toBe(240);
    expect(getAdaptiveSearchDelay('perceuse', 'insertFromPaste')).toBe(100);
    expect(
      getAdaptiveSearchDelay('per', 'insertText', { effectiveType: '2g', saveData: true }),
    ).toBe(640);
  });

  it('replaces the URL after the debounce while preserving filters and resetting pagination', () => {
    render(
      <CatalogLiveSearch
        initialValue=""
        label="Search"
        placeholder="Tool"
        searchingLabel="Searching"
      />,
    );
    const input = screen.getByRole('searchbox', { name: 'Search' });

    fireEvent.change(input, { target: { value: 'perc' } });
    expect(input).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersByTime(239));
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(navigation.replace).toHaveBeenCalledWith('/fr/products?brand=2&q=perc', {
      scroll: false,
    });
  });

  it('waits for an Arabic composition session to finish before searching', () => {
    render(
      <CatalogLiveSearch
        initialValue=""
        label="البحث"
        placeholder="مثقاب"
        searchingLabel="جارٍ البحث"
      />,
    );
    const input = screen.getByRole('searchbox', { name: 'البحث' });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'اداه' } });
    act(() => vi.advanceTimersByTime(1_000));
    expect(navigation.replace).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { data: 'اداه' });
    act(() => vi.advanceTimersByTime(240));
    expect(navigation.replace).toHaveBeenCalledWith(
      '/fr/products?brand=2&q=%D8%A7%D8%AF%D8%A7%D9%87',
      { scroll: false },
    );
  });
});
