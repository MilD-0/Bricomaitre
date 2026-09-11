import { getDb, getPool } from '@bric/db/client';
import {
  landingPageRevisions,
  landingPages,
  metaEventOutbox,
  orders,
  products,
  storefrontOrderIdempotency,
} from '@bric/db/schema';
import {
  countStorefrontProducts,
  readStorefrontProductBuildFeed,
  readStorefrontProductById,
  readStorefrontProductByToken,
} from '@bric/storefront-core/catalog';
import {
  storefrontOrderCreateRequestSchema,
  storefrontProductListQuerySchema,
} from '@bric/storefront-core/contracts';
import { readPublishedStorefrontLandingPage } from '@bric/storefront-core/landing-page-records';
import {
  buildIdempotencyFingerprint,
  claimStorefrontOrderIdempotency,
  clearStorefrontOrderIdempotency,
  StorefrontOrderClaimLostError,
} from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder } from '@bric/storefront-core/orders';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

const runId = randomUUID();
afterAll(async () => {
  await getPool().end();
});

describe('storefront transaction boundaries', () => {
  it('includes only public products and discovery fields in the complete build feed', async () => {
    const db = getDb();
    const rows = await db
      .insert(products)
      .values([
        {
          slug: `feed-public-${runId}`,
          title: 'Public feed product',
          price: '100',
          active: true,
          mongoId: '123456789012345678901234',
        },
        {
          slug: `feed-inactive-${runId}`,
          title: 'Inactive feed product',
          price: '100',
          active: false,
        },
        {
          slug: `feed-archived-${runId}`,
          title: 'Archived feed product',
          price: '100',
          active: true,
          archivedAt: new Date(),
        },
      ])
      .returning();
    try {
      const ids = new Set(rows.map((row) => row.id));
      const feed = await readStorefrontProductBuildFeed(db);
      expect(feed.filter((item) => ids.has(item.id))).toEqual([
        {
          id: rows[0]!.id,
          slug: rows[0]!.slug,
          mongoId: rows[0]!.mongoId,
          updatedAt: rows[0]!.updatedAt.toISOString(),
        },
      ]);
    } finally {
      await db.delete(products).where(
        inArray(
          products.id,
          rows.map((row) => row.id),
        ),
      );
    }
  });

  it('fences stale completion and cleanup after an expired claim is replaced', async () => {
    const db = getDb();
    const keyHash = `fencing-${runId}`;
    const fingerprint = 'same-payload';
    const now = new Date();
    const input = { keyHash, fingerprint, processingTtlSeconds: 120 };
    const first = await claimStorefrontOrderIdempotency(db, { ...input, now });
    const replacement = await claimStorefrontOrderIdempotency(db, {
      ...input,
      now: new Date(now.getTime() + 121_000),
    });
    if (first.kind !== 'started' || replacement.kind !== 'started')
      throw new Error('Expected two lease generations');
    const stale = { keyHash, fingerprint, createdAt: first.createdAt };
    const owned = { keyHash, fingerprint, createdAt: replacement.createdAt };
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1: '0551119991' });
    let orderId: number | undefined;
    try {
      await clearStorefrontOrderIdempotency(db, stale);
      const [retained] = await db
        .select()
        .from(storefrontOrderIdempotency)
        .where(eq(storefrontOrderIdempotency.keyHash, keyHash));
      expect(retained?.createdAt).toEqual(replacement.createdAt);
      await expect(
        createStorefrontOrder(db, payload, { idempotency: stale }),
      ).rejects.toBeInstanceOf(StorefrontOrderClaimLostError);
      const winner = await createStorefrontOrder(db, payload, { idempotency: owned });
      orderId = winner.item.id;
      await expect(
        createStorefrontOrder(db, payload, { idempotency: stale }),
      ).rejects.toBeInstanceOf(StorefrontOrderClaimLostError);
      await clearStorefrontOrderIdempotency(db, stale);
      await expect(claimStorefrontOrderIdempotency(db, input)).resolves.toMatchObject({
        kind: 'completed',
        orderId,
      });
      expect(
        await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.phoneNumber1, payload.phoneNumber1)),
      ).toEqual([{ id: orderId }]);
    } finally {
      if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
      await db
        .delete(storefrontOrderIdempotency)
        .where(eq(storefrontOrderIdempotency.keyHash, keyHash));
    }
  });

  it.each([
    { table: 'meta_event_outbox', column: 'event_id' },
    { table: 'order_meta_attribution', column: 'lead_event_id' },
  ])(
    'commits the commercial order when optional $table persistence fails',
    async ({ table, column }) => {
      const db = getDb();
      const eventId = `optional-${table}-${runId}`;
      const functionName = `sf_failure_${randomUUID().replaceAll('-', '')}`;
      const reportEnrichmentError = vi.fn();
      const keyHash = eventId;
      const fingerprint = eventId;
      const claim = await claimStorefrontOrderIdempotency(db, {
        keyHash,
        fingerprint,
        processingTtlSeconds: 120,
      });
      if (claim.kind !== 'started') throw new Error('Expected new claim');
      const [product] = await db
        .insert(products)
        .values({ title: 'Optional capture product', slug: eventId, price: '100' })
        .returning();
      const payload = storefrontOrderCreateRequestSchema.parse({
        phoneNumber1: '0551119992',
        cartProducts: [String(product!.id)],
        state: 16,
        city: 'Alger Centre',
        homeAddress: 'Test address',
        meta: {
          semanticsVersion: 'confirmed_purchase_v1',
          leadEventId: eventId,
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        },
      });
      // Identifiers and event values are generated by this test, never user input.
      await getPool().query(
        `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.${column} = '${eventId}' THEN RAISE EXCEPTION 'simulated optional persistence failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${functionName} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
      );
      let orderId: number | undefined;
      try {
        const result = await createStorefrontOrder(db, payload, {
          idempotency: { keyHash, fingerprint, createdAt: claim.createdAt },
          reportEnrichmentError,
        });
        orderId = result.item.id;
        expect(result.item.statusHistory).toHaveLength(1);
        expect(result.meta).toBeUndefined();
        expect(result.item.variant).toBeNull();
        expect(reportEnrichmentError).toHaveBeenCalledOnce();
        expect(
          await db.select().from(metaEventOutbox).where(eq(metaEventOutbox.eventId, eventId)),
        ).toEqual([]);
        await expect(
          claimStorefrontOrderIdempotency(db, { keyHash, fingerprint, processingTtlSeconds: 120 }),
        ).resolves.toMatchObject({ kind: 'completed', orderId });
      } finally {
        await getPool().query(
          `DROP TRIGGER ${functionName} ON ${table}; DROP FUNCTION ${functionName}()`,
        );
        if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
        await db.delete(products).where(eq(products.id, product!.id));
        await db
          .delete(storefrontOrderIdempotency)
          .where(eq(storefrontOrderIdempotency.keyHash, keyHash));
      }
    },
  );

  it('coalesces concurrent exact submissions and preserves the first purchase event', async () => {
    const db = getDb();
    const phoneNumber1 = '0551119988';
    const keys = [`duplicate-a-${runId}`, `duplicate-b-${runId}`];
    const eventIds = [`purchase-a-${runId}`, `purchase-b-${runId}`];
    const [product] = await db
      .insert(products)
      .values({ title: 'Duplicate guard product', slug: `duplicate-${runId}`, price: '100' })
      .returning();
    const payloads = eventIds.map((eventId, index) =>
      storefrontOrderCreateRequestSchema.parse({
        phoneNumber1,
        cartProducts: [String(product!.id)],
        delivery: 1,
        visitId: `visit-${index}-${runId}`,
        journeyId: `journey-${index}-${runId}`,
        meta: {
          semanticsVersion: 'confirmed_purchase_v1',
          leadEventId: eventId,
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        },
      }),
    );
    const claims = (
      await Promise.all(
        keys.map((keyHash, index) =>
          claimStorefrontOrderIdempotency(db, {
            keyHash,
            fingerprint: buildIdempotencyFingerprint(payloads[index]),
            processingTtlSeconds: 120,
          }),
        ),
      )
    ).map((claim) => {
      if (claim.kind !== 'started') throw new Error('Expected a fresh duplicate-test claim');
      return claim;
    });

    try {
      const results = await Promise.all(
        payloads.map((payload, index) =>
          createStorefrontOrder(db, payload, {
            idempotency: {
              keyHash: keys[index]!,
              fingerprint: buildIdempotencyFingerprint(payload),
              createdAt: claims[index]!.createdAt,
            },
          }),
        ),
      );
      expect(results.map((result) => result.coalesced).sort()).toEqual([false, true]);
      expect(new Set(results.map((result) => result.item.id)).size).toBe(1);
      expect(new Set(results.map((result) => result.item.purchaseEventId)).size).toBe(1);

      const createdOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.phoneNumber1, phoneNumber1));
      expect(createdOrders).toHaveLength(1);
      const outboxRows = await db
        .select({ eventId: metaEventOutbox.eventId })
        .from(metaEventOutbox)
        .where(inArray(metaEventOutbox.eventId, eventIds));
      expect(outboxRows).toHaveLength(1);
      expect(results[0]!.item.purchaseEventId).toBe(outboxRows[0]!.eventId);
      expect(results[1]!.item.purchaseEventId).toBe(outboxRows[0]!.eventId);

      const attempts = await db
        .select({ orderId: storefrontOrderIdempotency.orderId })
        .from(storefrontOrderIdempotency)
        .where(inArray(storefrontOrderIdempotency.keyHash, keys));
      expect(attempts).toHaveLength(2);
      expect(new Set(attempts.map((attempt) => attempt.orderId))).toEqual(
        new Set([createdOrders[0]!.id]),
      );
    } finally {
      await db.delete(metaEventOutbox).where(inArray(metaEventOutbox.eventId, eventIds));
      await db.delete(orders).where(eq(orders.phoneNumber1, phoneNumber1));
      await db.delete(products).where(eq(products.id, product!.id));
      await db
        .delete(storefrontOrderIdempotency)
        .where(inArray(storefrontOrderIdempotency.keyHash, keys));
    }
  });

  it('keeps landing foreign keys and checkout IDs exact when a product slug looks like another ID', async () => {
    const db = getDb();
    const [first] = await db
      .insert(products)
      .values({ title: 'Bound product', slug: `bound-${runId}`, price: '100' })
      .returning();
    const [collision] = await db
      .insert(products)
      .values({ title: 'Numeric slug product', slug: String(first!.id), price: '200' })
      .returning();
    let pageId: number | undefined;
    let orderId: number | undefined;
    try {
      const [page] = await db
        .insert(landingPages)
        .values({
          productId: first!.id,
          locale: 'fr',
          slug: `bound-landing-${runId}`,
          status: 'published',
          publishedRevision: 1,
        })
        .returning();
      pageId = page!.id;
      await db.insert(landingPageRevisions).values({
        landingPageId: pageId,
        revision: 1,
        document: {
          schemaVersion: 1,
          theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
          seo: {
            title: 'Bound product',
            description: 'Commander le produit sélectionné.',
            indexable: false,
          },
          blocks: [
            {
              id: 'hero',
              type: 'product-hero',
              variant: 'media-left',
              heading: 'Bound product',
              subheading: '',
              imageUrl: null,
              imageAlt: '',
              primaryCtaLabel: 'Commander',
              showAddToCart: true,
            },
            {
              id: 'final',
              type: 'final-cta',
              variant: 'solid',
              heading: 'Commander',
              body: '',
              primaryCtaLabel: 'Commander',
              imageUrl: null,
              imageAlt: '',
            },
          ],
        },
      });
      expect((await readStorefrontProductByToken(db, String(first!.id)))?.item.id).toBe(
        collision!.id,
      );
      expect((await readStorefrontProductById(db, first!.id))?.item.id).toBe(first!.id);
      expect(
        await countStorefrontProducts(
          db,
          storefrontProductListQuerySchema.parse({ search: 'Bound product', id: first!.id }),
        ),
      ).toBe(1);
      expect(
        (await readPublishedStorefrontLandingPage(db, { slug: page!.slug, locale: 'fr' }))?.product
          .id,
      ).toBe(first!.id);
      const result = await createStorefrontOrder(
        db,
        storefrontOrderCreateRequestSchema.parse({
          phoneNumber1: '0551119993',
          cartProducts: [String(first!.id), String(collision!.id)],
          expectedProductSubtotal: 300,
        }),
      );
      orderId = result.item.id;
      expect(
        result.item.orderProducts.map((line) => line.productId).sort((a, b) => a! - b!),
      ).toEqual([first!.id, collision!.id].sort((a, b) => a - b));
      expect(result.item.productSubtotal).toBe(300);
    } finally {
      if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
      if (pageId) await db.delete(landingPages).where(eq(landingPages.id, pageId));
      await db.delete(products).where(inArray(products.id, [first!.id, collision!.id]));
    }
  });
});
