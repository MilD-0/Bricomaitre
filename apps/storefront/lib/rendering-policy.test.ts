import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '..');

function readAppFile(pathname: string) {
  return readFileSync(resolve(appRoot, pathname), 'utf8');
}

describe('public storefront rendering policy', () => {
  it.each(['app/[locale]/products/[token]/page.tsx', 'app/[locale]/landing/[slug]/page.tsx'])(
    'renders nonce-bearing route %s for each request',
    (pathname) => {
      const source = readAppFile(pathname);

      expect(source).toContain("export const dynamic = 'force-dynamic';");
      expect(source).not.toContain('export const revalidate');
      expect(source).not.toContain('generateStaticParams');
    },
  );

  it('keeps Cache Components disabled until unknown slugs preserve status and no-JavaScript HTML', () => {
    const config = readAppFile('next.config.ts');
    expect(config).not.toContain('cacheComponents: true');
  });

  it.each(['app/[locale]/checkout/page.tsx', 'app/[locale]/thank-you/page.tsx'])(
    'keeps customer-specific route %s outside static generation',
    (pathname) => {
      const source = readAppFile(pathname);
      expect(source).not.toContain('generateStaticParams');
      expect(source).not.toContain('export const revalidate');
    },
  );
});
