import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('../../providers/app-providers', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LocaleLayout from './layout';

describe('app/[locale]/layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFoundMock.mockImplementation(() => {
      throw new Error('NOT_FOUND');
    });
  });

  it('renders html with suppressHydrationWarning', async () => {
    const ui = await LocaleLayout({
      children: <div>content</div>,
      params: Promise.resolve({ locale: 'en' }),
    });

    const markup = renderToStaticMarkup(ui);

    expect(markup).toContain('<html lang="en" dir="ltr">');
    expect(ui.props.suppressHydrationWarning).toBe(true);
  });

  it('rejects unsupported locales', async () => {
    await expect(
      LocaleLayout({
        children: <div>content</div>,
        params: Promise.resolve({ locale: 'de' }),
      }),
    ).rejects.toThrow('NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
