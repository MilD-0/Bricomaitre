import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogLiveSearch, getAdaptiveSearchDelay } from './catalog-live-search';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), query: 'brand=2&page=3' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/fr/products',
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

describe('CatalogLiveSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.replace.mockReset();
    navigation.query = 'brand=2&page=3';
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
  it('cancels queued typing when navigation changes the authoritative query', () => {
    const props = { label: 'Search', placeholder: 'Tool', searchingLabel: 'Searching' };
    const { rerender } = render(<CatalogLiveSearch {...props} initialValue="old" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'typed' } });
    navigation.query = 'brand=4&q=external';
    rerender(<CatalogLiveSearch {...props} initialValue="external" />);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole('searchbox')).toHaveValue('external');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('searchbox')).toHaveAttribute('aria-busy', 'false');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fresh' } });
    act(() => vi.advanceTimersByTime(240));
    expect(navigation.replace).toHaveBeenCalledWith('/fr/products?brand=4&q=fresh', {
      scroll: false,
    });
  });

  it('cancels a debounce on a filter change even when the authoritative search is unchanged', () => {
    const props = {
      initialValue: '',
      label: 'Search',
      placeholder: 'Tool',
      searchingLabel: 'Searching',
    };
    const { rerender } = render(<CatalogLiveSearch {...props} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'typed' } });
    navigation.query = 'brand=7&sort=price';
    rerender(<CatalogLiveSearch {...props} />);
    act(() => vi.advanceTimersByTime(1_000));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('keeps newer typing when its own earlier search navigation completes', () => {
    const props = { label: 'Search', placeholder: 'Tool', searchingLabel: 'Searching' };
    const { rerender } = render(<CatalogLiveSearch {...props} initialValue="" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'drill' } });
    act(() => vi.advanceTimersByTime(240));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'drill bits' } });
    navigation.query = 'brand=2&q=drill';
    rerender(<CatalogLiveSearch {...props} initialValue="drill" />);
    expect(screen.getByRole('searchbox')).toHaveValue('drill bits');
    act(() => vi.advanceTimersByTime(240));
    expect(navigation.replace).toHaveBeenLastCalledWith('/fr/products?brand=2&q=drill+bits', {
      scroll: false,
    });
  });
});
