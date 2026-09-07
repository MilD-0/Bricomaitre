import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  analyticsAiDailyRollups,
  analyticsEvents,
  analyticsJourneys,
  assetBanners,
  featuredProductGroupProducts,
  featuredProductGroups,
  products,
  profitTrackerDays,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { applyHistoryAction } from '../lib/action-history';
import { getAiStatsData } from '../lib/ai-stats';
import { deleteAdminAsset, patchAdminAsset, reorderAdminAssets } from '../lib/asset-mutations';
import { getProfitTrackerReport } from '../lib/profit-tracker';
import { getLiveStorefrontAiStats } from '../lib/stats-experience-ai';

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
  it.each([
    {
      dayTimezone: 'UTC',
      expectedTrend: [{ bucket: '2093-02-01', messages: 8 }],
      throughDate: '2093-02-01',
    },
    {
      dayTimezone: 'Africa/Algiers',
      expectedTrend: [
        { bucket: '2093-02-01', messages: 7 },
        { bucket: '2093-02-02', messages: 1 },
      ],
      throughDate: '2093-02-02',
    },
  ])(
    'combines retained $dayTimezone shopping days with raw Algeria days without double counting',
    async ({ dayTimezone, expectedTrend, throughDate }) => {
      const db = getDb(),
        journeyId = randomUUID();
      await db.insert(analyticsJourneys).values({ id: journeyId });
      const [rollup] = await db
        .insert(analyticsAiDailyRollups)
        .values({
          day: '2093-02-01',
          dayTimezone,
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
        // A legacy UTC row covers Feb 1 at 23:30Z; a local row instead covers
        // Jan 31 at 23:30Z. The remaining raw event keeps its Algeria day.
        expect(report.data.trend.map(({ bucket, messages }) => ({ bucket, messages }))).toEqual(
          expectedTrend,
        );
        expect(report.coverage).toEqual({
          fromDate: '2093-02-01',
          throughDate,
          records: 16,
        });
        const compact = await getLiveStorefrontAiStats(db, query);
        expect(compact).toMatchObject({ opens: 5, messages: 8 });
      } finally {
        await db.delete(analyticsAiDailyRollups).where(eq(analyticsAiDailyRollups.id, rollup!.id));
        await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, journeyId));
      }
    },
  );

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
});
