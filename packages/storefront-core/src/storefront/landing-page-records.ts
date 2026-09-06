import type { getDb } from '@bric/db/client';
import { landingPageRevisions, landingPages } from '@bric/db/schema';
import { and, eq } from 'drizzle-orm';

import { readStorefrontProductById } from './catalog';
import {
  landingPageDocumentSchema,
  landingPageLocaleSchema,
  landingPageRevisionSchema,
  landingPageSlugSchema,
  storefrontLandingPageResponseSchema,
  type StorefrontLandingPageResponse,
} from './landing-pages';

type Database = ReturnType<typeof getDb>;

type LandingPageRevisionPointer = {
  id: number;
  productId: number;
  slug: string;
  locale: string;
  revision: number | null;
  publishedAt: Date | null;
};

export async function readPublishedStorefrontLandingPage(
  db: Database,
  input: { slug: string; locale: string },
): Promise<StorefrontLandingPageResponse | null> {
  const slug = landingPageSlugSchema.parse(input.slug);
  const locale = landingPageLocaleSchema.parse(input.locale);
  const selection = {
    id: landingPages.id,
    productId: landingPages.productId,
    slug: landingPages.slug,
    locale: landingPages.locale,
    revision: landingPages.publishedRevision,
    publishedAt: landingPages.publishedAt,
  };
  const pages = await db
    .select(selection)
    .from(landingPages)
    .where(and(eq(landingPages.slug, slug), eq(landingPages.status, 'published')))
    .limit(2);
  let page = pages.find((candidate) => candidate.locale === locale) ?? pages[0];
  if (!page?.revision) return null;

  // A language switch preserves the source slug. Resolve its product's active
  // translation, falling back to the source when only one language is published.
  if (page.locale !== locale) {
    const [translation] = await db
      .select(selection)
      .from(landingPages)
      .where(
        and(
          eq(landingPages.productId, page.productId),
          eq(landingPages.locale, locale),
          eq(landingPages.status, 'published'),
        ),
      )
      .limit(1);
    if (translation) page = translation;
  }

  return readStorefrontLandingPageRevisionPointer(db, page);
}

export async function readStorefrontLandingPageRevision(
  db: Database,
  input: { slug: string; locale: string; revision: number },
): Promise<StorefrontLandingPageResponse | null> {
  const slug = landingPageSlugSchema.parse(input.slug);
  const locale = landingPageLocaleSchema.parse(input.locale);
  const revision = landingPageRevisionSchema.parse(input.revision);
  const [page] = await db
    .select({
      id: landingPages.id,
      productId: landingPages.productId,
      slug: landingPages.slug,
      locale: landingPages.locale,
      revision: landingPages.draftRevision,
      publishedAt: landingPages.publishedAt,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.slug, slug),
        eq(landingPages.locale, locale),
        eq(landingPages.draftRevision, revision),
      ),
    )
    .limit(1);

  if (!page) return null;

  return readStorefrontLandingPageRevisionPointer(db, page);
}

async function readStorefrontLandingPageRevisionPointer(
  db: Database,
  page: LandingPageRevisionPointer,
): Promise<StorefrontLandingPageResponse | null> {
  if (!page.revision) return null;

  const [revision, product] = await Promise.all([
    db
      .select({ document: landingPageRevisions.document })
      .from(landingPageRevisions)
      .where(
        and(
          eq(landingPageRevisions.landingPageId, page.id),
          eq(landingPageRevisions.revision, page.revision),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    readStorefrontProductById(db, page.productId),
  ]);

  if (!revision || !product) return null;

  return storefrontLandingPageResponseSchema.parse({
    id: page.id,
    slug: page.slug,
    locale: page.locale,
    revision: page.revision,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    document: landingPageDocumentSchema.parse(revision.document),
    product: product.item,
  });
}
