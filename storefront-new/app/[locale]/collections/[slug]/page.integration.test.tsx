import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: { slug?: string }) => (
    key === 'title' ? `Collection ${values?.slug}` : key
  )),
}));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('not-found'); }) }));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/route-foundation', () => ({
  RouteFoundation: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h1>{title}</h1>{children}</section>,
}));

import CollectionPage, { CollectionPageContent } from './page';

describe('collection route cache boundary', () => {
  it('keeps request params inside the suspense-wrapped content component', async () => {
    const shell = CollectionPage({ params: Promise.resolve({ locale: 'fr', slug: 'atelier' }) });
    expect(shell.type).toBeDefined();

    const markup = renderToStaticMarkup(await CollectionPageContent({
      params: Promise.resolve({ locale: 'fr', slug: 'atelier' }),
    }));
    expect(markup).toContain('Collection atelier');
    expect(markup).toContain('foundationBody');
  });
});
