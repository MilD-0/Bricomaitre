import type { LandingPageDocument } from '@bric/storefront-core/landing-pages';
import {
  landingPageDocumentSchema,
  landingPageSlugSchema,
} from '@bric/storefront-core/landing-pages';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';

import { getDb } from '@bric/db/client';
import { landingPageRevisions, landingPages, products } from '@bric/db/schema';

export function landingPageSlugFromProduct(product: { slug: string }, uniqueId?: number | string) {
  const productSlug = landingPageSlugSchema.parse(product.slug);
  if (uniqueId == null) return productSlug;
  if (!/^\d+$/.test(String(uniqueId))) throw new Error('Landing page unique id must be numeric.');

  const suffix = `-${uniqueId}`;
  const base = productSlug.slice(0, 160 - suffix.length).replace(/-+$/, '');
  return landingPageSlugSchema.parse(`${base}${suffix}`);
}

function temporaryLandingPageSlug(product: { slug: string }) {
  const generatedNumber = `${Date.now()}${randomInt(100_000, 1_000_000)}`;
  return landingPageSlugFromProduct(product, generatedNumber);
}

export function buildDefaultLandingPageDocument(input: {
  locale: 'fr' | 'ar';
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}): LandingPageDocument {
  const ar = input.locale === 'ar';
  const title = input.title.trim();
  const description =
    input.description?.trim() ||
    (ar ? `اكتشف ${title} واطلبه بسهولة.` : `Découvrez ${title} et commandez-le simplement.`);
  return landingPageDocumentSchema.parse({
    schemaVersion: 2,
    theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
    seo: {
      title: title.slice(0, 70),
      description: description.slice(0, 170),
      indexable: false,
    },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero',
        variant: 'media-left',
        heading: title,
        subheading: description.slice(0, 1_000),
        imageUrl: input.imageUrl ?? null,
        imageAlt: title,
        primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
        showAddToCart: true,
      },
      {
        id: 'benefits',
        type: 'benefit-grid',
        variant: 'icons',
        heading: ar ? 'لماذا تختاره؟' : 'Pourquoi le choisir ?',
        items: [
          {
            title: ar ? 'طلب بسيط' : 'Commande simple',
            description: ar ? 'اطلبه في خطوات قليلة.' : 'Commandez en quelques étapes.',
            icon: 'phone',
          },
          {
            title: ar ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
            description: ar
              ? 'ادفع عند استلام طلبك.'
              : 'Payez lorsque vous recevez votre commande.',
            icon: 'payment',
          },
          {
            title: ar ? 'توصيل سريع' : 'Livraison rapide',
            description: ar ? 'إلى جميع أنحاء الجزائر.' : 'Partout en Algérie.',
            icon: 'delivery',
          },
        ],
      },
      {
        id: 'details',
        type: 'media-feature',
        variant: 'media-right',
        heading: ar ? 'مصمم للعمل' : 'Pensé pour le travail',
        body: description,
        imageUrl: input.imageUrl ?? null,
        imageAlt: title,
        bullets: [],
      },
      {
        id: 'specifications',
        type: 'specifications',
        variant: 'table',
        heading: ar ? 'المواصفات' : 'Caractéristiques',
        items: [{ label: ar ? 'المنتج' : 'Produit', value: title }],
      },
      {
        id: 'faq',
        type: 'faq',
        variant: 'accordion',
        heading: ar ? 'أسئلة شائعة' : 'Questions fréquentes',
        items: [
          {
            question: ar ? 'كيف يتم تأكيد الطلب؟' : 'Comment la commande est-elle confirmée ?',
            answer: ar
              ? 'نتصل بك هاتفياً لتأكيد طلبك.'
              : 'Nous vous appelons pour confirmer votre commande.',
          },
        ],
      },
      {
        id: 'final',
        type: 'final-cta',
        variant: 'solid',
        heading: ar ? `اطلب ${title} الآن` : `Commandez ${title} maintenant`,
        body: ar ? 'طلب سريع ودفع عند الاستلام.' : 'Commande rapide et paiement à la livraison.',
        primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
        imageUrl: input.imageUrl ?? null,
        imageAlt: title,
      },
    ],
  });
}

export class LandingPageConflictError extends Error {
  constructor(message = 'This landing page changed after you opened it.') {
    super(message);
    this.name = 'LandingPageConflictError';
  }
}

export class LandingPageNotFoundError extends Error {
  constructor() {
    super('Landing page not found.');
    this.name = 'LandingPageNotFoundError';
  }
}

export function normalizeLandingPageDocument(document: unknown): LandingPageDocument {
  const parsed = landingPageDocumentSchema.parse(document);
  return landingPageDocumentSchema.parse({
    ...parsed,
    seo: { ...parsed.seo, indexable: false },
  });
}

function documentsMatch(left: LandingPageDocument, right: LandingPageDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildLandingPagePublicationUpdate(input: {
  active: boolean;
  revision: number;
  now: Date;
}) {
  if (!input.active) return { status: 'draft' as const };
  return {
    status: 'published' as const,
    publishedRevision: input.revision,
    publishedAt: input.now,
  };
}

export async function listLandingPageSummaries() {
  const db = getDb();
  const rows = await db
    .select({
      id: landingPages.id,
      productId: landingPages.productId,
      productTitle: products.title,
      productSlug: products.slug,
      locale: landingPages.locale,
      slug: landingPages.slug,
      status: landingPages.status,
      currentRevision: landingPages.draftRevision,
      updatedAt: landingPages.updatedAt,
    })
    .from(landingPages)
    .innerJoin(products, eq(landingPages.productId, products.id))
    .orderBy(desc(landingPages.updatedAt));

  return rows.map(({ status, updatedAt, ...row }) => ({
    ...row,
    active: status === 'published',
    updatedAt: updatedAt.toISOString(),
  }));
}

export type LandingPageSummaryQuery = {
  landingPageIds: number[];
  productIds: number[];
  query: string;
  locale: 'fr' | 'ar' | null;
  active: boolean | null;
  page: number;
  limit: number;
};

export async function queryLandingPageSummaries(input: LandingPageSummaryQuery) {
  const db = getDb();
  const where = and(
    input.landingPageIds.length ? inArray(landingPages.id, input.landingPageIds) : undefined,
    input.productIds.length ? inArray(landingPages.productId, input.productIds) : undefined,
    input.locale ? eq(landingPages.locale, input.locale) : undefined,
    input.active === null
      ? undefined
      : input.active
        ? eq(landingPages.status, 'published')
        : sql`${landingPages.status} <> 'published'`,
    input.query
      ? sql`position(lower(${input.query.normalize('NFKC')}) in lower(concat_ws(' ', ${landingPages.id}, ${landingPages.productId}, ${products.title}, ${products.slug}, ${landingPages.slug}))) > 0`
      : undefined,
  );
  const [[totalRow], known] = await Promise.all([
    db
      .select({ total: count() })
      .from(landingPages)
      .innerJoin(products, eq(landingPages.productId, products.id))
      .where(where),
    input.landingPageIds.length
      ? db
          .select({ id: landingPages.id })
          .from(landingPages)
          .where(inArray(landingPages.id, input.landingPageIds))
      : Promise.resolve([]),
  ]);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select({
      id: landingPages.id,
      productId: landingPages.productId,
      productTitle: products.title,
      productSlug: products.slug,
      locale: landingPages.locale,
      slug: landingPages.slug,
      status: landingPages.status,
      currentRevision: landingPages.draftRevision,
      updatedAt: landingPages.updatedAt,
    })
    .from(landingPages)
    .innerJoin(products, eq(landingPages.productId, products.id))
    .where(where)
    .orderBy(desc(landingPages.updatedAt), desc(landingPages.id))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);
  const knownIds = new Set(known.map((row) => row.id));
  return {
    items: rows.map(({ status, updatedAt, ...row }) => ({
      ...row,
      active: status === 'published',
      updatedAt: updatedAt.toISOString(),
    })),
    missingIds: input.landingPageIds.filter((id) => !knownIds.has(id)),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
      hasNextPage: input.page * input.limit < total,
    },
  };
}

export async function getLandingPageDetail(id: number) {
  const db = getDb();
  const [row] = await db
    .select({
      id: landingPages.id,
      productId: landingPages.productId,
      productTitle: products.title,
      productSlug: products.slug,
      locale: landingPages.locale,
      slug: landingPages.slug,
      status: landingPages.status,
      currentRevision: landingPages.draftRevision,
      updatedAt: landingPages.updatedAt,
      document: landingPageRevisions.document,
    })
    .from(landingPages)
    .innerJoin(products, eq(landingPages.productId, products.id))
    .innerJoin(
      landingPageRevisions,
      and(
        eq(landingPageRevisions.landingPageId, landingPages.id),
        eq(landingPageRevisions.revision, landingPages.draftRevision),
      ),
    )
    .where(eq(landingPages.id, id))
    .limit(1);

  if (!row) throw new LandingPageNotFoundError();
  const { status, updatedAt, document, ...rest } = row;
  return {
    ...rest,
    active: status === 'published',
    updatedAt: updatedAt.toISOString(),
    document: normalizeLandingPageDocument(document),
  };
}

export async function listLandingPages() {
  const db = getDb();
  const rows = await db
    .select({
      id: landingPages.id,
      productId: landingPages.productId,
      productTitle: products.title,
      locale: landingPages.locale,
      slug: landingPages.slug,
      status: landingPages.status,
      draftRevision: landingPages.draftRevision,
      publishedRevision: landingPages.publishedRevision,
      updatedAt: landingPages.updatedAt,
    })
    .from(landingPages)
    .innerJoin(products, eq(landingPages.productId, products.id))
    .orderBy(desc(landingPages.updatedAt));

  return Promise.all(
    rows.map(async (row) => {
      const [revision] = await db
        .select({ document: landingPageRevisions.document })
        .from(landingPageRevisions)
        .where(
          and(
            eq(landingPageRevisions.landingPageId, row.id),
            eq(landingPageRevisions.revision, row.draftRevision),
          ),
        )
        .limit(1);
      return {
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        document: landingPageDocumentSchema.parse(revision?.document),
      };
    }),
  );
}

export async function createLandingPage(input: {
  productId: number;
  locale: 'fr' | 'ar';
  document?: unknown;
  actorId?: string | null;
  source?: string;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({
        title: products.title,
        titleAr: products.titleAr,
        description: products.description,
        descriptionAr: products.descriptionAr,
        images: products.images,
        slug: products.slug,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error('Product not found.');
    const document =
      input.document == null
        ? buildDefaultLandingPageDocument({
            locale: input.locale,
            title: input.locale === 'ar' && product.titleAr ? product.titleAr : product.title,
            description: input.locale === 'ar' ? product.descriptionAr : product.description,
            imageUrl: product.images[0] ?? null,
          })
        : normalizeLandingPageDocument(input.document);
    const [page] = await tx
      .insert(landingPages)
      .values({
        productId: input.productId,
        locale: input.locale,
        slug: temporaryLandingPageSlug(product),
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning({ id: landingPages.id });
    const slug = landingPageSlugFromProduct(product, page.id);
    await tx.update(landingPages).set({ slug }).where(eq(landingPages.id, page.id));
    await tx.insert(landingPageRevisions).values({
      landingPageId: page.id,
      revision: 1,
      document,
      source: input.source ?? 'admin',
      createdBy: input.actorId,
    });
    return { id: page.id, slug, document };
  });
}

export async function saveLandingPage(input: {
  id: number;
  document: unknown;
  active: boolean;
  expectedRevision: number;
  actorId?: string | null;
  source?: string;
}) {
  const document = normalizeLandingPageDocument(input.document);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: landingPages.id,
        status: landingPages.status,
        draftRevision: landingPages.draftRevision,
      })
      .from(landingPages)
      .where(eq(landingPages.id, input.id))
      .limit(1)
      .for('update');
    if (!current) throw new LandingPageNotFoundError();
    if (current.draftRevision !== input.expectedRevision) throw new LandingPageConflictError();

    const [savedRevision] = await tx
      .select({ document: landingPageRevisions.document })
      .from(landingPageRevisions)
      .where(
        and(
          eq(landingPageRevisions.landingPageId, input.id),
          eq(landingPageRevisions.revision, current.draftRevision),
        ),
      )
      .limit(1);
    if (!savedRevision) throw new LandingPageConflictError('The current revision is unavailable.');

    const changed = !documentsMatch(normalizeLandingPageDocument(savedRevision.document), document);
    let revision = current.draftRevision;
    if (changed) {
      const [next] = await tx
        .select({ revision: sql<number>`coalesce(max(${landingPageRevisions.revision}), 0) + 1` })
        .from(landingPageRevisions)
        .where(eq(landingPageRevisions.landingPageId, input.id));
      revision = Number(next?.revision ?? current.draftRevision + 1);
      await tx.insert(landingPageRevisions).values({
        landingPageId: input.id,
        revision,
        document,
        source: input.source ?? 'admin',
        createdBy: input.actorId,
      });
    }

    const now = new Date();
    await tx
      .update(landingPages)
      .set({
        ...buildLandingPagePublicationUpdate({ active: input.active, revision, now }),
        draftRevision: revision,
        updatedBy: input.actorId,
        updatedAt: now,
      })
      .where(eq(landingPages.id, input.id));

    return { id: input.id, active: input.active, currentRevision: revision, changed };
  });
}

export async function setLandingPageActive(input: {
  id: number;
  active: boolean;
  expectedRevision: number;
  actorId?: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ draftRevision: landingPages.draftRevision })
      .from(landingPages)
      .where(eq(landingPages.id, input.id))
      .limit(1)
      .for('update');
    if (!current) throw new LandingPageNotFoundError();
    if (current.draftRevision !== input.expectedRevision) throw new LandingPageConflictError();

    const now = new Date();
    await tx
      .update(landingPages)
      .set({
        ...buildLandingPagePublicationUpdate({
          active: input.active,
          revision: current.draftRevision,
          now,
        }),
        updatedBy: input.actorId,
        updatedAt: now,
      })
      .where(eq(landingPages.id, input.id));
    return { id: input.id, active: input.active, currentRevision: current.draftRevision };
  });
}
