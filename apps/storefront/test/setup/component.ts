import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Component tests assert link behavior and telemetry without asking JSDOM to
// perform full-document navigation, which it intentionally does not implement.
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href]')) {
    event.preventDefault();
  }
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
