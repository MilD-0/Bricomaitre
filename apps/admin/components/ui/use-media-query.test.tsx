import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

describe('useMediaQuery', () => {
  it('subscribes to the requested query and reflects changes', () => {
    let matches = false;
    let listener: (() => void) | undefined;
    const addEventListener = vi.fn((_event: string, nextListener: () => void) => {
      listener = nextListener;
    });
    const removeEventListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches,
          media: query,
          addEventListener,
          removeEventListener,
        }) as unknown as MediaQueryList,
    );

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1280px)'));
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      listener?.();
    });
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
