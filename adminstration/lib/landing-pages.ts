import type { LandingPageDocument } from '@bric/storefront-core/landing-pages';
import { landingPageDocumentSchema, landingPageSlugSchema } from '@bric/storefront-core/landing-pages';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import { landingPageRevisions, landingPages, products } from '../db/schema';

export function landingPageSlugFromProduct(product: { slug: string }) {
  return landingPageSlugSchema.parse(product.slug);
}

export function buildDefaultLandingPageDocument(input: {
  locale: 'fr' | 'ar';
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}): LandingPageDocument {
  const ar = input.locale === 'ar';
  const title = input.title.trim();
  const description = input.description?.trim() || (ar ? `اكتشف ${title} واطلبه بسهولة.` : `Découvrez ${title} et commandez-le simplement.`);
  return landingPageDocumentSchema.parse({
    schemaVersion: 2,
    theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
    seo: {
      title: title.slice(0, 70),
      description: description.slice(0, 170),
      indexable: false,
    },
    blocks: [
      { id: 'hero', type: 'product-hero', variant: 'media-left', heading: title, subheading: description.slice(0, 1_000), imageUrl: input.imageUrl ?? null, imageAlt: title, primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant', showAddToCart: true },
      { id: 'benefits', type: 'benefit-grid', variant: 'icons', heading: ar ? 'لماذا تختاره؟' : 'Pourquoi le choisir ?', items: [
        { title: ar ? 'طلب بسيط' : 'Commande simple', description: ar ? 'اطلبه في خطوات قليلة.' : 'Commandez en quelques étapes.', icon: 'phone' },
        { title: ar ? 'الدفع عند الاستلام' : 'Paiement à la livraison', description: ar ? 'ادفع عند استلام طلبك.' : 'Payez lorsque vous recevez votre commande.', icon: 'payment' },
        { title: ar ? 'توصيل سريع' : 'Livraison rapide', description: ar ? 'إلى جميع أنحاء الجزائر.' : 'Partout en Algérie.', icon: 'delivery' },
      ] },
      { id: 'details', type: 'media-feature', variant: 'media-right', heading: ar ? 'مصمم للعمل' : 'Pensé pour le travail', body: description, imageUrl: input.imageUrl ?? null, imageAlt: title, bullets: [] },
      { id: 'specifications', type: 'specifications', variant: 'table', heading: ar ? 'المواصفات' : 'Caractéristiques', items: [{ label: ar ? 'المنتج' : 'Produit', value: title }] },
      { id: 'faq', type: 'faq', variant: 'accordion', heading: ar ? 'أسئلة شائعة' : 'Questions fréquentes', items: [{ question: ar ? 'كيف يتم تأكيد الطلب؟' : 'Comment la commande est-elle confirmée ?', answer: ar ? 'نتصل بك هاتفياً لتأكيد طلبك.' : 'Nous vous appelons pour confirmer votre commande.' }] },
      { id: 'final', type: 'final-cta', variant: 'solid', heading: ar ? `اطلب ${title} الآن` : `Commandez ${title} maintenant`, body: ar ? 'طلب سريع ودفع عند الاستلام.' : 'Commande rapide et paiement à la livraison.', primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant', imageUrl: input.imageUrl ?? null, imageAlt: title },
    ],
  });
}

export async function listLandingPages() {
  const db = getDb();
  const rows = await db.select({
    id: landingPages.id,
    productId: landingPages.productId,
    productTitle: products.title,
    locale: landingPages.locale,
    slug: landingPages.slug,
    status: landingPages.status,
    draftRevision: landingPages.draftRevision,
    publishedRevision: landingPages.publishedRevision,
    updatedAt: landingPages.updatedAt,
  }).from(landingPages).innerJoin(products, eq(landingPages.productId, products.id)).orderBy(desc(landingPages.updatedAt));

  return Promise.all(rows.map(async (row) => {
    const [revision] = await db.select({ document: landingPageRevisions.document })
      .from(landingPageRevisions)
      .where(and(eq(landingPageRevisions.landingPageId, row.id), eq(landingPageRevisions.revision, row.draftRevision)))
      .limit(1);
    return { ...row, updatedAt: row.updatedAt.toISOString(), document: landingPageDocumentSchema.parse(revision?.document) };
  }));
}

export async function createLandingPage(input: { productId: number; locale: 'fr' | 'ar'; document?: unknown; actorId?: string | null; source?: string }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ title: products.title, titleAr: products.titleAr, description: products.description, descriptionAr: products.descriptionAr, images: products.images, slug: products.slug })
      .from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product) throw new Error('Product not found.');
    const document = input.document == null ? buildDefaultLandingPageDocument({ locale: input.locale, title: input.locale === 'ar' && product.titleAr ? product.titleAr : product.title, description: input.locale === 'ar' ? product.descriptionAr : product.description, imageUrl: product.images[0] ?? null }) : landingPageDocumentSchema.parse(input.document);
    const [page] = await tx.insert(landingPages).values({ productId: input.productId, locale: input.locale, slug: landingPageSlugFromProduct(product), createdBy: input.actorId, updatedBy: input.actorId }).returning({ id: landingPages.id });
    await tx.insert(landingPageRevisions).values({ landingPageId: page.id, revision: 1, document, source: input.source ?? 'admin', createdBy: input.actorId });
    return { id: page.id, document };
  });
}

export async function saveLandingPageRevision(input: { id: number; document: unknown; actorId?: string | null; source?: string }) {
  const document = landingPageDocumentSchema.parse(input.document);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [page] = await tx.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.id, input.id)).limit(1);
    if (!page) throw new Error('Landing page not found.');
    const [next] = await tx.select({ revision: sql<number>`coalesce(max(${landingPageRevisions.revision}), 0) + 1` }).from(landingPageRevisions).where(eq(landingPageRevisions.landingPageId, input.id));
    const revision = Number(next?.revision ?? 1);
    await tx.insert(landingPageRevisions).values({ landingPageId: input.id, revision, document, source: input.source ?? 'admin', createdBy: input.actorId });
    await tx.update(landingPages).set({ draftRevision: revision, updatedBy: input.actorId, updatedAt: new Date() }).where(eq(landingPages.id, input.id));
    return { id: input.id, revision };
  });
}

export async function setLandingPagePublication(input: { id: number; publish: boolean; actorId?: string | null }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ draftRevision: landingPages.draftRevision })
      .from(landingPages)
      .where(eq(landingPages.id, input.id))
      .limit(1);
    if (!current) throw new Error('Landing page not found.');

    const [page] = await tx.update(landingPages).set(input.publish ? {
      status: 'published', publishedRevision: current.draftRevision, publishedAt: new Date(), updatedAt: new Date(), updatedBy: input.actorId,
    } : {
      status: 'draft', publishedRevision: null, publishedAt: null, updatedAt: new Date(), updatedBy: input.actorId,
    }).where(eq(landingPages.id, input.id)).returning({ id: landingPages.id, status: landingPages.status });
    return page;
  });
}
