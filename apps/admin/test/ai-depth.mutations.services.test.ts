import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsJourneys,
  orders,
  productPromoCodes,
  products,
  profitTrackerSettings,
  storefrontSettings,
} from '@bric/db/schema';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  toStorefrontContactSettings,
} from '@bric/storefront-core/settings';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  manageAdminAiAnalyticsCosts,
  updateAdminAiAnalyticsSettings,
} from '../lib/admin-ai-analytics-actions';
import { analyticsForAssistant } from '../lib/ai-analytics';
import { getAnalyticsData } from '../lib/analytics';
import { patchProductThroughCanonicalWorkflow } from '../lib/product-update-workflow';
import {
  createProfitTrackerCost,
  deleteProfitTrackerCost,
  getProfitTrackerSettings,
  listProfitTrackerCosts,
  updateProfitTrackerCost,
  updateProfitTrackerSettings,
} from '../lib/profit-tracker';
import { loadStorefrontSettings, saveStorefrontSettings } from '../lib/storefront-settings';

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createProductContentGenerator: () => ({
    generate: async ({ fields }: { fields: string[] }) => ({
      changes: Object.fromEntries(fields.map((field) => [field, 'Generated copy'])),
      reasoning: 'Catalog facts',
      usage: {},
      model: 'test-content',
    }),
  }),
}));

afterAll(async () => {
  await getPool().end();
});

describe('durable AI evidence', () => {
  it('merges product patches under the history lock and validates the current promotions', async () => {
    const db = getDb(),
      marker = randomUUID();
    const actor = { email: `${marker}@example.invalid` };
    const [product] = await db
      .insert(products)
      .values({ title: 'Original title', slug: marker, price: '100', inventoryQuantity: 8 })
      .returning();
    await db.insert(productPromoCodes).values({
      productId: product!.id,
      code: 'SAVE',
      normalizedCode: 'save',
      promoPrice: '90',
      active: true,
    });
    try {
      await Promise.all([
        patchProductThroughCanonicalWorkflow(
          db,
          product!.id,
          { title: 'Operator title', inventoryQuantity: 11 },
          actor,
        ),
        patchProductThroughCanonicalWorkflow(
          db,
          product!.id,
          { purchasePrice: 60, availabilityStatus: 'out_of_stock' },
          actor,
        ),
      ]);
      const [stored] = await db.select().from(products).where(eq(products.id, product!.id));
      expect(stored).toMatchObject({
        title: 'Operator title',
        inventoryQuantity: 11,
        purchasePrice: '60.00',
        inStock: false,
        availabilityStatus: 'out_of_stock',
      });
      await expect(
        patchProductThroughCanonicalWorkflow(db, product!.id, { price: 80 }, actor),
      ).rejects.toThrow('Active promo price');
      const [afterInvalid] = await db.select().from(products).where(eq(products.id, product!.id));
      expect(afterInvalid).toEqual(stored);
      const result = await patchProductThroughCanonicalWorkflow(
        db,
        product!.id,
        { titleAr: 'مثقاب' },
        actor,
      );
      expect(result.previous).toMatchObject({
        title: 'Operator title',
        inventoryQuantity: 11,
        purchasePrice: 60,
        promoCodes: [{ code: 'SAVE', promoPrice: 90 }],
      });
      expect(
        await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email)),
      ).toHaveLength(3);
    } finally {
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db.delete(productPromoCodes).where(eq(productPromoCodes.productId, product!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('updates storefront settings atomically without applying defaults to omitted fields', async () => {
    const db = getDb();
    const [original] = await db
      .select()
      .from(storefrontSettings)
      .where(eq(storefrontSettings.id, 1));
    try {
      await saveStorefrontSettings({
        ...DEFAULT_STOREFRONT_SETTINGS,
        aiAssistantEnabled: false,
        aiModel: 'configured/custom-model',
        aiFallbackModel: 'configured/fallback',
        contactEmail: 'shop@example.invalid',
      });
      await Promise.all([
        saveStorefrontSettings({ contactPhone: '0550123456' }),
        saveStorefrontSettings({ address: 'New shop address' }),
      ]);
      const receipt = await saveStorefrontSettings({ facebookUrl: null });
      expect(receipt).toMatchObject({
        contactPhone: '0550123456',
        address: 'New shop address',
        aiAssistantEnabled: false,
        aiModel: 'configured/custom-model',
        aiFallbackModel: 'configured/fallback',
        contactEmail: 'shop@example.invalid',
        facebookUrl: null,
      });
      const [stored] = await db
        .select()
        .from(storefrontSettings)
        .where(eq(storefrontSettings.id, 1));
      expect(stored).toMatchObject(receipt);
      await expect(saveStorefrontSettings({ contactPhone: 'invalid' })).rejects.toThrow();
      const [afterInvalid] = await db
        .select()
        .from(storefrontSettings)
        .where(eq(storefrontSettings.id, 1));
      expect(afterInvalid).toEqual(stored);
      const clearedContacts = {
        contactEmail: null,
        address: null,
        mapUrl: null,
        facebookUrl: null,
      };
      await saveStorefrontSettings(clearedContacts);
      const reloaded = await loadStorefrontSettings();
      expect(reloaded).toMatchObject({
        ...clearedContacts,
        contactPhone: '0550123456',
        aiModel: 'configured/custom-model',
      });
      expect(toStorefrontContactSettings(reloaded)).toMatchObject(clearedContacts);
    } finally {
      if (original) {
        await db.update(storefrontSettings).set(original).where(eq(storefrontSettings.id, 1));
      } else {
        await db.delete(storefrontSettings).where(eq(storefrontSettings.id, 1));
      }
    }
  });

  it('preserves concurrent operator settings and cost edits when the assistant patches named fields', async () => {
    const db = getDb();
    const [savedSettings] = await db
      .select()
      .from(profitTrackerSettings)
      .where(eq(profitTrackerSettings.id, 1));
    const cost = await createProfitTrackerCost(
      {
        name: 'Old rent name',
        amountDzd: 20000,
        period: 'monthly',
        startDate: '2095-01-01',
        endDate: '2095-12-31',
      },
      db,
    );
    try {
      await updateProfitTrackerSettings({ fxRate: 280, defaultReturnRate: 18, restFrom: null }, db);
      const settingsResult = await updateAdminAiAnalyticsSettings(
        { planningReturnRate: 24 },
        {
          updateSettings: async (patch) => {
            // Another operator commits after the assistant starts but before its write.
            await updateProfitTrackerSettings({ fxRate: 335, restFrom: '2095-02-01' }, db);
            return updateProfitTrackerSettings(patch, db);
          },
          refreshFacts: async () => true,
        },
      );
      expect(settingsResult).toMatchObject({
        previous: { planningReturnRate: 18 },
        current: { planningReturnRate: 24 },
      });
      expect(await getProfitTrackerSettings(db)).toMatchObject({
        fxRate: 335,
        defaultReturnRate: 24,
        restFrom: '2095-02-01',
      });
      const result = await manageAdminAiAnalyticsCosts(
        { operations: [{ action: 'update', id: cost.id, changes: { amountDzd: 42000 } }] },
        {
          createCost: (input) => createProfitTrackerCost(input, db),
          deleteCost: (id) => deleteProfitTrackerCost(id, db),
          updateCost: async (id, patch) => {
            await updateProfitTrackerCost(
              id,
              { name: 'New operator name', endDate: '2096-01-01' },
              db,
            );
            return updateProfitTrackerCost(id, patch, db);
          },
          refreshFacts: async () => true,
        },
      );
      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'updated',
          previous: expect.objectContaining({
            name: 'New operator name',
            amountDzd: 20000,
            endDate: '2096-01-01',
          }),
          current: expect.objectContaining({
            name: 'New operator name',
            amountDzd: 42000,
            endDate: '2096-01-01',
          }),
        }),
      ]);
      await expect(
        updateProfitTrackerCost(cost.id, { startDate: '2097-01-01' }, db),
      ).rejects.toThrow('endDate must not precede startDate');
      expect((await listProfitTrackerCosts(db)).find((row) => row.id === cost.id)).toMatchObject({
        startDate: '2095-01-01',
        amountDzd: 42000,
      });
      expect(await deleteProfitTrackerCost(cost.id, db)).toMatchObject({
        name: 'New operator name',
        amountDzd: 42000,
      });
      expect(await updateProfitTrackerCost(cost.id, { amountDzd: 100 }, db)).toBeNull();
    } finally {
      await deleteProfitTrackerCost(cost.id, db);
      if (savedSettings)
        await db
          .update(profitTrackerSettings)
          .set(savedSettings)
          .where(eq(profitTrackerSettings.id, 1));
      else await db.delete(profitTrackerSettings).where(eq(profitTrackerSettings.id, 1));
    }
  });

  it('returns retained product interest to the assistant without double-counting rolled events', async () => {
    const db = getDb();
    const marker = randomUUID();
    const startDate = '2096-03-01',
      endDate = '2096-03-02';
    const [product] = await db
      .insert(products)
      .values({
        title: 'Telemetry product',
        slug: marker,
        price: '10',
      })
      .returning();
    await db.insert(analyticsJourneys).values({ id: marker });
    const [order] = await db
      .insert(orders)
      .values({
        phoneNumber1: '0550000333',
        cartProducts: [String(product!.id)],
        createdAt: new Date(`${startDate}T12:00:00Z`),
      })
      .returning();
    const rollups = await db
      .insert(analyticsDailyRollups)
      .values([
        { day: startDate, dimension: 'overall', dimensionKey: '', productViews: 4 },
        {
          day: startDate,
          dimension: 'product',
          dimensionKey: String(product!.id),
          productViews: 4,
        },
      ])
      .returning();
    try {
      await db.insert(analyticsEvents).values(
        [startDate, endDate].map((day) => ({
          eventId: randomUUID(),
          journeyId: marker,
          sessionId: marker,
          eventName: 'view_item',
          productId: product!.id,
          occurredAt: new Date(`${day}T12:00:00Z`),
        })),
      );
      const payload = await getAnalyticsData(
        {
          view: 'storefront',
          range: 'custom',
          startDate,
          endDate,
        },
        { db, now: new Date(`${endDate}T16:00:00Z`), includeStorefrontDetails: true },
      );
      const result = analyticsForAssistant(payload, {
        dimension: 'storefront_products',
        identifiers: [String(product!.id)],
        limit: 20,
      });
      expect(result.focus?.rows).toEqual([
        expect.objectContaining({
          id: String(product!.id),
          title: 'Telemetry product',
          viewCount: 5,
          websitePurchaseCount: 1,
          websiteConversionRate: 20,
        }),
      ]);
    } finally {
      await db.delete(analyticsDailyRollups).where(
        inArray(
          analyticsDailyRollups.id,
          rollups.map((row) => row.id),
        ),
      );
      await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, marker));
      await db.delete(orders).where(eq(orders.id, order!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });
});
