import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  aiConversations,
  aiMessages,
  aiProposals,
  aiRuns,
  aiToolCalls,
  analyticsEconomicsDailyFacts,
  processedOrders,
  analyticsAiDailyRollups,
  categories,
  products,
  landingPages,
  orders,
  orderStatusHistory,
  orderLineItems,
  analyticsJourneys,
  analyticsEvents,
  analyticsDailyRollups,
  profitTrackerSettings,
  profitTrackerDays,
  storefrontSettings,
  productPromoCodes,
  actionLogs,
  assetBanners,
  featuredProductGroups,
  featuredProductGroupProducts,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import {
  loadEconomicsPair,
  loadMaterializedEconomicsReport,
} from '../lib/analytics/economics-data';
import { loadAssumptionsView } from '../lib/analytics/assumptions-search-views';
import { loadFulfillmentView } from '../lib/analytics/acquisition-fulfillment-views';
import { resolveAnalyticsFilters, clipAnalyticsFilters } from '../lib/analytics/date-range';
import { ANALYTICS_FACT_SEMANTICS_VERSION } from '../lib/analytics-fact-contract';
import { getAiStatsData } from '../lib/ai-stats';
import { getLiveStorefrontAiStats } from '../lib/stats-experience-ai';
import { DEFAULT_STOREFRONT_SETTINGS } from '@bric/storefront-core/settings';
import { patchAdminAsset, deleteAdminAsset, reorderAdminAssets } from '../lib/asset-mutations';
import { applyHistoryAction } from '../lib/action-history';
import { patchProductThroughCanonicalWorkflow } from '../lib/product-update-workflow';
import { saveStorefrontSettings } from '../lib/storefront-settings';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  createProfitTrackerCost,
  getProfitTrackerReport,
  deleteProfitTrackerCost,
  listProfitTrackerCosts,
  getProfitTrackerSettings,
  updateProfitTrackerCost,
  updateProfitTrackerSettings,
} from '../lib/profit-tracker';
import {
  manageAdminAiAnalyticsCosts,
  updateAdminAiAnalyticsSettings,
} from '../lib/admin-ai-analytics-actions';
import { getAnalyticsData } from '../lib/analytics';
import { analyticsForAssistant } from '../lib/ai-analytics';
import { inspectAdminOrders } from '../lib/admin-ai-domain';
import { loadOrderDetail, loadOrderRecordsByIds } from '../lib/admin-orders-data';
import { proposeProductCategoryAssignment } from '../lib/ai-product-category-proposals';
import { executeAiProposalReview } from '../lib/ai-proposal-review-workflow';
import { publishAiTaskTerminalMessage } from '../lib/ai-task-followups';
import { runAiContentJob } from '../lib/background-jobs';
import { createLandingPage, queryLandingPageSummaries } from '../lib/landing-pages';

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
  it('returns empty economics for a valid range outside source coverage without weakening public date validation', async () => {
    const db = getDb();
    const requested = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: '2091-01-01',
      endDate: '2091-01-03',
    });
    const clipped = clipAnalyticsFilters(requested, '2091-02-01', '2091-02-01');
    expect(clipped.startDate! > clipped.endDate).toBe(true);
    const report = await loadEconomicsPair(db, clipped, '2091-02-01');
    expect(report.current.days).toEqual([]);
    expect(report.current.summary).toMatchObject({ postedOrders: 0, grossProfitDzd: 0 });
    expect(report.previous).toBeNull();
    const cutoffs = {
      orders: '2091-02-01',
      ordersFrom: '2091-02-01',
      posted: '2091-02-01',
      postedFrom: '2091-02-01',
      ecotrack: '2091-02-01',
      ecotrackFrom: '2091-02-01',
      paidFrom: '2091-02-01',
      meta: '2091-02-01',
      metaFrom: '2091-02-01',
      storefront: null,
      storefrontFrom: null,
    };
    const assumptions = await loadAssumptionsView(db, requested, cutoffs);
    expect(assumptions.data.days).toEqual([]);
    const fulfillment = await loadFulfillmentView(db, requested, cutoffs);
    expect(fulfillment.data.summary.postedOrders).toBe(0);

    await expect(
      getProfitTrackerReport(
        { range: 'custom', startDate: clipped.startDate!, endDate: clipped.endDate },
        { db },
      ),
    ).rejects.toThrow();
  });

  it('preserves imported settlements when current projected facts are otherwise usable', async () => {
    const db = getDb(),
      day = '2091-06-01',
      tracking = randomUUID();
    const filters = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: day,
      endDate: day,
    });
    await db.insert(analyticsEconomicsDailyFacts).values({
      day,
      fxRateUsed: '280',
      planningReturnRatePct: '15',
      semanticsVersion: ANALYTICS_FACT_SEMANTICS_VERSION,
      refreshedAt: new Date('2091-06-02T12:00:00Z'),
    });
    try {
      expect(await loadMaterializedEconomicsReport(db, filters)).not.toBeNull();
      await db.insert(processedOrders).values({
        orderId: tracking,
        tracking,
        importBatchId: randomUUID(),
        encaissedAt: new Date(day + 'T12:00:00Z'),
        amountCollected: '500',
        totalFees: '50',
        netRevenue: '450',
        productCost: '100',
        profit: '350',
      });
      const report = await loadEconomicsPair(db, filters);
      expect(report.current.realized.summary).toMatchObject({
        settledOrders: 1,
        realizedProfitDzd: 350,
        amountCollectedDzd: 500,
      });
      expect(report.current.realized.days).toEqual([
        expect.objectContaining({ date: day, settledOrders: 1, realizedProfitDzd: 350 }),
      ]);
      expect(report.current.coverage.settledOrders).toBe(1);
    } finally {
      await db.delete(processedOrders).where(eq(processedOrders.tracking, tracking));
      await db
        .delete(analyticsEconomicsDailyFacts)
        .where(eq(analyticsEconomicsDailyFacts.day, day));
    }
  });

  it('counts every tool type while limiting the display and respecting the operations business day', async () => {
    const db = getDb();
    const runs = await db
      .insert(aiRuns)
      .values(
        [new Date('2093-01-01T23:30:00Z'), new Date('2093-01-02T23:30:00Z')].map((startedAt) => ({
          surface: 'admin' as const,
          task: 'admin_chat',
          status: 'completed' as const,
          model: 'test-model',
          promptVersion: 'test-version',
          actorId: randomUUID(),
          startedAt,
          completedAt: new Date(startedAt.getTime() + 1000),
        })),
      )
      .returning();
    try {
      await db.insert(aiToolCalls).values(
        Array.from({ length: 33 }, (_, index) => ({
          runId: runs[0]!.id,
          toolName: `tool-${Math.floor(index / 2)}`,
          status: index === 32 ? 'failed' : 'completed',
          startedAt: runs[0]!.startedAt,
          completedAt: runs[0]!.completedAt,
        })),
      );
      const report = await getAiStatsData(
        {
          surface: 'operations',
          range: 'custom',
          startDate: '2093-01-02',
          endDate: '2093-01-02',
          grain: 'day',
        },
        { db, now: new Date('2093-01-02T12:00:00Z') },
      );
      expect(report.data.kind).toBe('operations');
      if (report.data.kind !== 'operations') throw new Error('Expected operations stats');
      expect(report.data.summary).toMatchObject({
        interactiveRuns: 1,
        toolCalls: 33,
        completedToolCalls: 32,
      });
      expect(report.data.metrics.find((metric) => metric.key === 'toolCompletion')).toMatchObject({
        sample: 33,
        value: 96.97,
      });
      expect(report.data.tools).toHaveLength(16);
      expect(report.data.trend.map((row) => row.bucket)).toEqual(['2093-01-02']);
      expect(report.coverage).toEqual({
        fromDate: '2093-01-02',
        throughDate: '2093-01-02',
        records: 1,
      });
    } finally {
      await db.delete(aiRuns).where(
        inArray(
          aiRuns.id,
          runs.map((run) => run.id),
        ),
      );
    }
  });

  it('combines retained shopping days and the raw UTC tail without losing coverage or double counting', async () => {
    const db = getDb(),
      journeyId = randomUUID();
    await db.insert(analyticsJourneys).values({ id: journeyId });
    const [rollup] = await db
      .insert(analyticsAiDailyRollups)
      .values({
        day: '2093-02-01',
        dimension: 'overall',
        dimensionKey: '',
        opens: 5,
        messages: 7,
        runs: 1,
        completed: 1,
        errors: 2,
      })
      .returning();
    try {
      await db.insert(analyticsEvents).values(
        ['2093-01-31T23:30:00Z', '2093-02-01T23:30:00Z', '2093-02-02T23:30:00Z'].map(
          (occurredAt) => ({
            eventId: randomUUID(),
            journeyId,
            sessionId: journeyId,
            eventName: 'ai_assistant_message',
            occurredAt: new Date(occurredAt),
            metadata: { storefrontProject: STOREFRONT_ANALYTICS_PROJECT },
          }),
        ),
      );
      const query = {
        surface: 'shopping' as const,
        range: 'custom' as const,
        startDate: '2093-02-01',
        endDate: '2093-02-02',
        grain: 'day' as const,
      };
      const report = await getAiStatsData(query, { db, now: new Date('2093-02-02T12:00:00Z') });
      expect(report.data.kind).toBe('shopping');
      if (report.data.kind !== 'shopping') throw new Error('Expected shopping stats');
      expect(report.data.summary).toMatchObject({ opens: 5, messages: 8 });
      expect(report.data.trend.map(({ bucket, messages }) => ({ bucket, messages }))).toEqual([
        { bucket: '2093-02-01', messages: 7 },
        { bucket: '2093-02-02', messages: 1 },
      ]);
      expect(report.coverage).toEqual({
        fromDate: '2093-02-01',
        throughDate: '2093-02-02',
        records: 16,
      });
      const compact = await getLiveStorefrontAiStats(db, query);
      expect(compact).toMatchObject({ opens: 5, messages: 8 });
    } finally {
      await db.delete(analyticsAiDailyRollups).where(eq(analyticsAiDailyRollups.id, rollup!.id));
      await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, journeyId));
    }
  });

  it('respects an explicit all-history cutoff rather than broadening the report to today', async () => {
    const db = getDb();
    const dates = ['2094-01-01', '2094-01-03'];
    await db
      .insert(profitTrackerDays)
      .values(dates.map((day) => ({ day, grossProfitDzd: '100', fxRateUsed: '280' })));
    try {
      const report = await getProfitTrackerReport(
        { range: 'all', endDate: '2094-01-02' },
        { db, now: new Date('2094-01-04T12:00:00Z') },
      );
      expect(report.filters.range).toBe('all');
      expect(report.filters.endDate <= '2094-01-02').toBe(true);
      expect(report.days.some((day) => day.date === dates[0])).toBe(true);
      expect(report.days.some((day) => day.date === dates[1])).toBe(false);
      expect(report.days.every((day) => day.date <= report.filters.endDate)).toBe(true);
    } finally {
      await db.delete(profitTrackerDays).where(inArray(profitTrackerDays.day, dates));
    }
  });

  it('audits atomic asset reorders, rejects stale AI lists, and supports undo and redo', async () => {
    const db = getDb(),
      actor = { email: `${randomUUID()}@example.invalid` };
    const banners = await db
      .insert(assetBanners)
      .values([
        { title: 'First', imageUrl: 'https://cdn.example.com/first.jpg', sortOrder: 0 },
        { title: 'Second', imageUrl: 'https://cdn.example.com/second.jpg', sortOrder: 1 },
      ])
      .returning();
    const first = banners[0]!,
      second = banners[1]!;
    try {
      await expect(
        reorderAdminAssets(
          db,
          { kind: 'banner', items: [{ id: first.id, sortOrder: 1 }] },
          actor,
          true,
        ),
      ).rejects.toThrow('Missing:');
      await expect(
        reorderAdminAssets(
          db,
          {
            kind: 'banner',
            items: [
              { id: first.id, sortOrder: 1 },
              { id: 2147483647, sortOrder: 0 },
            ],
          },
          actor,
        ),
      ).rejects.toThrow('not found');
      expect(
        await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(assetBanners).where(eq(assetBanners.id, first.id)))[0]?.sortOrder,
      ).toBe(0);
      const result = await reorderAdminAssets(
        db,
        {
          kind: 'banner',
          items: [
            { id: second.id, sortOrder: 0 },
            { id: first.id, sortOrder: 1 },
          ],
        },
        actor,
      );
      expect(result.before).toEqual([first.id, second.id]);
      const actions = await db
        .select()
        .from(actionLogs)
        .where(eq(actionLogs.createdBy, actor.email))
        .orderBy(desc(actionLogs.id));
      expect(actions).toHaveLength(2);
      for (const action of actions)
        await applyHistoryAction(db, { actionLogId: action.id, direction: 'undo', actor });
      const restored = await db
        .select()
        .from(assetBanners)
        .where(inArray(assetBanners.id, [first.id, second.id]));
      expect(new Map(restored.map(({ id, sortOrder }) => [id, sortOrder]))).toEqual(
        new Map([
          [first.id, 0],
          [second.id, 1],
        ]),
      );
      for (const action of [...actions].reverse())
        await applyHistoryAction(db, { actionLogId: action.id, direction: 'redo', actor });
      expect(
        (await db.select().from(assetBanners).where(eq(assetBanners.id, first.id)))[0]?.sortOrder,
      ).toBe(1);
    } finally {
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db.delete(assetBanners).where(inArray(assetBanners.id, [first.id, second.id]));
    }
  });

  it('patches locked assets without losing concurrent fields, legacy images or featured selections', async () => {
    const db = getDb(),
      marker = randomUUID();
    const actor = { email: `${marker}@example.invalid` };
    const [product] = await db
      .insert(products)
      .values({ title: marker, slug: marker, price: '100' })
      .returning();
    const [banner] = await db
      .insert(assetBanners)
      .values({
        title: 'Old title',
        titleAr: 'قديم',
        imageUrl: 'https://cdn.example.com/legacy.jpg',
        active: true,
      })
      .returning();
    const [group] = await db
      .insert(featuredProductGroups)
      .values({ name: 'Old group', nameAr: 'مجموعة', active: true })
      .returning();
    await db
      .insert(featuredProductGroupProducts)
      .values({ groupId: group!.id, productId: product!.id });
    try {
      await patchAdminAsset(db, 'banner', banner!.id, { active: false }, actor);
      const [legacy] = await db.select().from(assetBanners).where(eq(assetBanners.id, banner!.id));
      expect(legacy).toMatchObject({
        active: false,
        imageUrlLandscape: null,
        imageUrlPortrait: null,
      });
      await Promise.all([
        patchAdminAsset(db, 'banner', banner!.id, { title: 'New title' }, actor),
        patchAdminAsset(db, 'banner', banner!.id, { titleAr: 'جديد' }, actor),
      ]);
      const updatedBanner = await patchAdminAsset(
        db,
        'banner',
        banner!.id,
        { imageUrlLandscape: 'https://cdn.example.com/new.jpg' },
        actor,
      );
      expect(updatedBanner).toMatchObject({
        previous: { title: 'New title', titleAr: 'جديد', active: false },
        data: {
          imageUrl: 'https://cdn.example.com/new.jpg',
          imageUrlPortrait: 'https://cdn.example.com/legacy.jpg',
        },
      });
      await Promise.all([
        patchAdminAsset(db, 'featured-group', group!.id, { name: 'Operator group' }, actor),
        patchAdminAsset(
          db,
          'featured-group',
          group!.id,
          { prioritizeRecommendations: true },
          actor,
        ),
      ]);
      const result = await patchAdminAsset(
        db,
        'featured-group',
        group!.id,
        { nameAr: 'جديد' },
        actor,
      );
      expect(result).toMatchObject({
        previous: {
          name: 'Operator group',
          prioritizeRecommendations: true,
          productIds: [product!.id],
        },
        data: { nameAr: 'جديد', productIds: [product!.id] },
      });
      await expect(
        patchAdminAsset(db, 'featured-group', group!.id, { productIds: [] }, actor),
      ).rejects.toThrow('Select at least one');
      const deleted = await deleteAdminAsset(db, 'featured-group', group!.id, actor);
      expect(deleted.previous).toMatchObject({
        name: 'Operator group',
        nameAr: 'جديد',
        productIds: [product!.id],
      });
    } finally {
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db
        .delete(featuredProductGroupProducts)
        .where(eq(featuredProductGroupProducts.groupId, group!.id));
      await db.delete(featuredProductGroups).where(eq(featuredProductGroups.id, group!.id));
      await db.delete(assetBanners).where(eq(assetBanners.id, banner!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

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

  it('batches exact order inspection with real history, line snapshots and legacy product references', async () => {
    const db = getDb();
    const marker = randomUUID();
    const [product] = await db
      .insert(products)
      .values({ title: 'Current catalog title', slug: marker, price: '10' })
      .returning();
    const rows = await db
      .insert(orders)
      .values([
        {
          firstName: 'Legacy customer',
          phoneNumber1: '0550000111',
          cartProducts: [String(product!.id), String(product!.id)],
          inHouseStatus: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 2,
        },
        {
          firstName: 'Snapshot customer',
          phoneNumber1: '0550000112',
          cartProducts: [String(product!.id)],
          productSubtotal: '16',
          totalAmount: '16',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
        },
      ])
      .returning();
    try {
      await db.insert(orderStatusHistory).values([
        {
          orderId: rows[0]!.id,
          status: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 2,
          changedAt: new Date('2026-01-02'),
          changedBy: 'second@example.invalid',
        },
        {
          orderId: rows[0]!.id,
          status: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 1,
          changedAt: new Date('2026-01-01'),
          changedBy: 'first@example.invalid',
        },
        {
          orderId: rows[1]!.id,
          status: ORDER_STATUS.CONFIRMED,
          changedAt: new Date('2026-01-03'),
          changedBy: 'confirmed@example.invalid',
        },
      ]);
      await db.insert(orderLineItems).values({
        orderId: rows[1]!.id,
        productId: product!.id,
        contentId: String(product!.id),
        rawValue: String(product!.id),
        titleSnapshot: 'Sold product title',
        originalUnitPrice: '10',
        effectiveUnitPrice: '8',
        quantity: 2,
        lineTotal: '16',
      });
      const missingId = Number.MAX_SAFE_INTEGER;
      const result = await inspectAdminOrders({
        orderIds: [rows[1]!.id, missingId, rows[0]!.id, rows[1]!.id],
      });
      expect(result.items.map((item) => item.id)).toEqual([rows[1]!.id, rows[0]!.id]);
      expect(result.missingIds).toEqual([missingId]);
      expect(result.items[0]).toMatchObject({
        products: [
          {
            productId: product!.id,
            title: 'Sold product title',
            quantity: 2,
            unitPrice: 8,
            lineTotal: 16,
          },
        ],
        statusHistory: [{ changedBy: 'confirmed@example.invalid' }],
      });
      expect(result.items[1]).toMatchObject({
        products: [
          { productId: product!.id, title: 'Current catalog title', quantity: 2, unitPrice: 10 },
        ],
        statusHistory: [
          { noAnswerCount: 1, changedBy: 'first@example.invalid' },
          { noAnswerCount: 2, changedBy: 'second@example.invalid' },
        ],
      });
      expect((await loadOrderDetail(rows[0]!.id, db))!.statusHistory).toHaveLength(2);
      expect((await loadOrderRecordsByIds([rows[0]!.id], db))[0]!.statusHistory).toEqual([]);
    } finally {
      await db.delete(orders).where(
        inArray(
          orders.id,
          rows.map((row) => row.id),
        ),
      );
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it.each(['product_content', 'product_category', 'product_relation'])(
    'allows rejecting expired %s proposals while refusing approval',
    async (proposalType) => {
      const db = getDb();
      const marker = randomUUID();
      const [product] = await db
        .insert(products)
        .values({ title: marker, slug: marker, price: '100' })
        .returning();
      const [run] = await db
        .insert(aiRuns)
        .values({
          surface: 'admin',
          task: proposalType,
          model: 'test',
          promptVersion: 'test',
          status: 'completed',
        })
        .returning();
      const [proposal] = await db
        .insert(aiProposals)
        .values({
          runId: run!.id,
          entityType: 'products',
          entityId: product!.id,
          proposalType,
          payload: {},
          sourceUpdatedAt: product!.updatedAt,
          expiresAt: new Date('2000-01-01'),
        })
        .returning();
      try {
        const input = {
          proposalId: proposal!.id,
          target: { proposalType, entityType: 'products' },
          actor: { email: 'reviewer@example.invalid' },
        };
        await expect(
          executeAiProposalReview({ ...input, action: 'approve' }),
        ).rejects.toMatchObject({ code: 'proposal_expired' });
        await expect(
          executeAiProposalReview({ ...input, action: 'reject' }),
        ).resolves.toMatchObject({ status: 'rejected', verified: true });
        expect(
          (await db.select().from(aiProposals).where(eq(aiProposals.id, proposal!.id)))[0],
        ).toMatchObject({ status: 'rejected' });
        expect((await db.select().from(products).where(eq(products.id, product!.id)))[0]).toEqual(
          product,
        );
      } finally {
        await db.delete(aiProposals).where(eq(aiProposals.runId, run!.id));
        await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
        await db.delete(products).where(eq(products.id, product!.id));
      }
    },
  );

  it('serializes competing terminal publishers and tolerates a deleted conversation', async () => {
    const db = getDb();
    const [conversation] = await db
      .insert(aiConversations)
      .values({ surface: 'admin', sessionKey: randomUUID() })
      .returning();
    try {
      const input = {
        conversationId: conversation!.id,
        jobId: randomUUID(),
        kind: 'ai-product-content',
        status: 'completed' as const,
      };
      const results = await Promise.all(
        Array.from({ length: 6 }, () => publishAiTaskTerminalMessage(input)),
      );
      expect(results.filter((result) => result.kind === 'published')).toHaveLength(1);
      expect(
        await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation!.id)),
      ).toHaveLength(1);
      await db.delete(aiConversations).where(eq(aiConversations.id, conversation!.id));
      await expect(publishAiTaskTerminalMessage(input)).resolves.toEqual({ kind: 'not-linked' });
    } finally {
      await db.delete(aiConversations).where(eq(aiConversations.id, conversation!.id));
    }
  });

  it('retains inference versions and refuses a product or category changed during classification', async () => {
    const db = getDb(),
      marker = randomUUID();
    const version = new Date('2026-01-01T00:00:00Z');
    const [product] = await db
      .insert(products)
      .values({ title: marker, slug: marker, price: '100', updatedAt: version })
      .returning();
    const [category] = await db
      .insert(categories)
      .values({ name: marker, slug: marker, isActive: true, updatedAt: version })
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_categorization',
        model: 'test',
        promptVersion: 'test',
        status: 'completed',
      })
      .returning();
    const input = {
      productId: product!.id,
      categoryId: category!.id,
      runId: run!.id,
      sourceUpdatedAt: version,
      categoryUpdatedAt: version,
      confidence: 0.94,
      reasoning: 'Supplied evidence',
    };
    try {
      await db
        .update(products)
        .set({ title: 'Edited after inference', updatedAt: new Date('2026-01-02T00:00:00Z') })
        .where(eq(products.id, product!.id));
      await expect(proposeProductCategoryAssignment(input)).rejects.toMatchObject({
        code: 'proposal_stale',
      });
      await db.update(products).set({ updatedAt: version }).where(eq(products.id, product!.id));
      await db
        .update(categories)
        .set({ updatedAt: new Date('2026-01-02T00:00:00Z') })
        .where(eq(categories.id, category!.id));
      await expect(proposeProductCategoryAssignment(input)).rejects.toMatchObject({
        code: 'proposal_stale',
      });
      expect(
        await db.select().from(aiProposals).where(eq(aiProposals.runId, run!.id)),
      ).toHaveLength(0);
      await db
        .update(categories)
        .set({ updatedAt: version })
        .where(eq(categories.id, category!.id));
      const result = await proposeProductCategoryAssignment(input);
      const [proposal] = await db.select().from(aiProposals).where(eq(aiProposals.id, result.id));
      expect(proposal).toMatchObject({
        runId: run!.id,
        confidence: '0.9400',
        sourceUpdatedAt: version,
      });
    } finally {
      await db.delete(aiProposals).where(eq(aiProposals.runId, run!.id));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(categories).where(eq(categories.id, category!.id));
    }
  });

  it('queries exact and paged landing summaries without returning unrelated pages', async () => {
    const db = getDb(),
      marker = randomUUID();
    const [product] = await db
      .insert(products)
      .values({ title: marker, slug: marker, price: '100' })
      .returning();
    try {
      const fr = await createLandingPage({ productId: product!.id, locale: 'fr' });
      const ar = await createLandingPage({ productId: product!.id, locale: 'ar' });
      const query = {
        landingPageIds: [],
        productIds: [product!.id],
        query: '',
        locale: null,
        active: null,
        page: 1,
        limit: 1,
      };
      const first = await queryLandingPageSummaries(query);
      const second = await queryLandingPageSummaries({ ...query, page: 2 });
      expect(first.pagination).toMatchObject({ total: 2, hasNextPage: true });
      expect(new Set([...first.items, ...second.items].map((item) => item.id))).toEqual(
        new Set([fr.id, ar.id]),
      );
      const exact = await queryLandingPageSummaries({
        ...query,
        landingPageIds: [fr.id],
        locale: 'fr',
      });
      expect(exact.items.map((item) => item.id)).toEqual([fr.id]);
      const empty = await queryLandingPageSummaries({
        ...query,
        landingPageIds: [fr.id],
        locale: 'ar',
      });
      expect(empty).toMatchObject({ items: [], missingIds: [], pagination: { total: 0 } });
    } finally {
      await db.delete(landingPages).where(eq(landingPages.productId, product!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });
  it('regenerates stale and disjoint-field content while retaining a usable pending proposal', async () => {
    const db = getDb(),
      marker = randomUUID(),
      version = new Date('2026-01-02T00:00:00Z');
    const rows = await db
      .insert(products)
      .values(
        ['stale', 'disjoint', 'reusable'].map((label) => ({
          title: label,
          slug: `${marker}-${label}`,
          price: '100',
          updatedAt: version,
        })),
      )
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_content_proposal',
        model: 'test',
        promptVersion: 'test',
        status: 'completed',
      })
      .returning();
    const owner = `${marker}@example.invalid`;
    try {
      await db.insert(aiProposals).values(
        rows.map((row, index) => ({
          runId: run!.id,
          proposalType: 'product_content',
          entityType: 'products',
          entityId: row.id,
          status: 'proposed' as const,
          sourceUpdatedAt: index === 0 ? new Date('2026-01-01T00:00:00Z') : version,
          payload: {
            changes:
              index === 1
                ? { descriptionAr: 'Existing Arabic description' }
                : { titleAr: 'Existing Arabic title' },
          },
          expiresAt: new Date(Date.now() + 86400000),
        })),
      );
      vi.stubEnv('AI_CONTENT_MODEL', 'test-content');
      const result = await runAiContentJob(
        {
          __jobMeta: { id: marker, ownerKey: owner, queueName: 'test', activeScope: 'owner' },
          productIds: rows.map((row) => row.id),
          fields: ['titleAr'],
          onlyMissing: false,
          autoApply: false,
          actor: { email: owner },
        },
        {
          throwIfCancelled: async () => {},
          updateProgress: async () => {},
          updateSummary: async () => {},
        },
      );
      expect(result).toMatchObject({ proposed: 2, alreadyProposed: 1, failed: 0, complete: true });
    } finally {
      vi.unstubAllEnvs();
      for (const row of rows) await db.delete(aiProposals).where(eq(aiProposals.entityId, row.id));
      await db.delete(aiRuns).where(eq(aiRuns.actorId, owner));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      for (const row of rows) await db.delete(products).where(eq(products.id, row.id));
    }
  });
});
