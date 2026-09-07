import type { AnalyticsEntityLevel } from '../contract';
import { type AnalyticsMetaEntity } from '../loaders-shared';
import { ratio } from '../metrics';

export type MetaDailyRow = {
  day: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spendEur: number;
  adCostDzd: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  uniqueOutboundClicks: number;
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;
  metaPurchases: number;
  purchaseValue: number;
  videoPlays: number;
  videoP25Watched: number;
  videoP50Watched: number;
  videoP75Watched: number;
  videoP95Watched: number;
  videoP100Watched: number;
  videoAverageWatchSeconds: number;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
};

export type MetaOutcomeRow = {
  campaignId: string | null;
  adsetId: string | null;
  adId: string;
  bricOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  attributionStartDate: string | null;
  projectedAdjustedProfitDzd: number;
  automaticPaidProfitDzd: number;
  profitCompleteOrders: number;
};

type MetaEntityAccumulator = Omit<
  AnalyticsMetaEntity,
  | 'ctrPct'
  | 'outboundCtrPct'
  | 'landingViewRatePct'
  | 'cpmEur'
  | 'videoPlayRatePct'
  | 'videoCompletionRatePct'
  | 'videoAverageWatchSeconds'
  | 'costPerPostedDzd'
  | 'costPerConfirmedDzd'
  | 'costPerDeliveredDzd'
  | 'costPerPaidDzd'
  | 'platformRoas'
  | 'outcomeSpendCoveragePct'
  | 'projectedProfitX'
  | 'paidProfitX'
  | 'profitCoveragePct'
> & { videoWatchSecondsWeighted: number };

function emptyMetaEntity(
  level: AnalyticsEntityLevel,
  row: Pick<
    MetaDailyRow,
    'campaignId' | 'campaignName' | 'adsetId' | 'adsetName' | 'adId' | 'adName'
  >,
): MetaEntityAccumulator {
  const id = level === 'campaign' ? row.campaignId : level === 'adset' ? row.adsetId : row.adId;
  const name =
    level === 'campaign' ? row.campaignName : level === 'adset' ? row.adsetName : row.adName;
  return {
    id,
    name: name || id,
    campaignId: row.campaignId || null,
    campaignName: row.campaignName || null,
    adsetId: level === 'campaign' ? null : row.adsetId || null,
    adsetName: level === 'campaign' ? null : row.adsetName || null,
    spendEur: 0,
    adCostDzd: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    outboundClicks: 0,
    uniqueOutboundClicks: 0,
    landingPageViews: 0,
    addToCarts: 0,
    checkouts: 0,
    metaPurchases: 0,
    purchaseValue: 0,
    videoPlays: 0,
    videoP25Watched: 0,
    videoP50Watched: 0,
    videoP75Watched: 0,
    videoP95Watched: 0,
    videoP100Watched: 0,
    videoWatchSecondsWeighted: 0,
    qualityRanking: null,
    engagementRateRanking: null,
    conversionRateRanking: null,
    bricOrders: 0,
    confirmedOrders: 0,
    postedOrders: 0,
    deliveredOrders: 0,
    paidOrders: 0,
    returnedOrders: 0,
    attributedAdCostDzd: 0,
    projectedAdjustedProfitDzd: 0,
    automaticPaidProfitDzd: 0,
    profitCompleteOrders: 0,
  };
}

function finalizeMetaEntity(row: MetaEntityAccumulator): AnalyticsMetaEntity {
  const { videoWatchSecondsWeighted, ...publicRow } = row;
  return {
    ...publicRow,
    ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
    outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
    landingViewRatePct:
      row.outboundClicks > 0 ? (row.landingPageViews / row.outboundClicks) * 100 : null,
    cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    videoPlayRatePct: row.impressions > 0 ? (row.videoPlays / row.impressions) * 100 : null,
    videoCompletionRatePct:
      row.videoPlays > 0 ? (row.videoP100Watched / row.videoPlays) * 100 : null,
    videoAverageWatchSeconds:
      row.videoPlays > 0 ? videoWatchSecondsWeighted / row.videoPlays : null,
    costPerPostedDzd: row.postedOrders > 0 ? row.attributedAdCostDzd / row.postedOrders : null,
    costPerConfirmedDzd:
      row.confirmedOrders > 0 ? row.attributedAdCostDzd / row.confirmedOrders : null,
    costPerDeliveredDzd:
      row.deliveredOrders > 0 ? row.attributedAdCostDzd / row.deliveredOrders : null,
    costPerPaidDzd: row.paidOrders > 0 ? row.attributedAdCostDzd / row.paidOrders : null,
    platformRoas: row.spendEur > 0 ? row.purchaseValue / row.spendEur : null,
    outcomeSpendCoveragePct: ratio(row.attributedAdCostDzd, row.adCostDzd),
    projectedProfitX:
      row.attributedAdCostDzd > 0 ? row.projectedAdjustedProfitDzd / row.attributedAdCostDzd : null,
    paidProfitX:
      row.attributedAdCostDzd > 0 && row.paidOrders > 0
        ? row.automaticPaidProfitDzd / row.attributedAdCostDzd
        : null,
    profitCoveragePct: ratio(row.profitCompleteOrders, row.postedOrders),
  };
}

export function publicMetaEntity(row: AnalyticsMetaEntity) {
  return {
    id: row.id,
    name: row.name,
    campaignName: row.campaignName,
    spendEur: row.spendEur,
    adCostDzd: row.adCostDzd,
    impressions: row.impressions,
    outboundClicks: row.outboundClicks,
    uniqueOutboundClicks: row.uniqueOutboundClicks,
    landingPageViews: row.landingPageViews,
    metaPurchases: row.metaPurchases,
    videoPlays: row.videoPlays,
    videoAverageWatchSeconds: row.videoAverageWatchSeconds,
    qualityRanking: row.qualityRanking,
    engagementRateRanking: row.engagementRateRanking,
    conversionRateRanking: row.conversionRateRanking,
    bricOrders: row.bricOrders,
    confirmedOrders: row.confirmedOrders,
    postedOrders: row.postedOrders,
    deliveredOrders: row.deliveredOrders,
    paidOrders: row.paidOrders,
    returnedOrders: row.returnedOrders,
    outboundCtrPct: row.outboundCtrPct,
    landingViewRatePct: row.landingViewRatePct,
    videoCompletionRatePct: row.videoCompletionRatePct,
    costPerPostedDzd: row.costPerPostedDzd,
    costPerDeliveredDzd: row.costPerDeliveredDzd,
    costPerPaidDzd: row.costPerPaidDzd,
    attributedAdCostDzd: row.attributedAdCostDzd,
    outcomeSpendCoveragePct: row.outcomeSpendCoveragePct,
    projectedProfitX: row.projectedProfitX,
    paidProfitX: row.paidProfitX,
    profitCoveragePct: row.profitCoveragePct,
  };
}

export function groupMetaEntities(
  level: AnalyticsEntityLevel,
  daily: MetaDailyRow[],
  outcomes: MetaOutcomeRow[],
) {
  const rows = new Map<string, MetaEntityAccumulator>();
  const namesByAdId = new Map(daily.map((row) => [row.adId, row]));
  const dailyByAdId = new Map<string, MetaDailyRow[]>();
  for (const row of daily) {
    const adRows = dailyByAdId.get(row.adId) ?? [];
    adRows.push(row);
    dailyByAdId.set(row.adId, adRows);
  }

  for (const day of daily) {
    const id = level === 'campaign' ? day.campaignId : level === 'adset' ? day.adsetId : day.adId;
    const current = rows.get(id) ?? emptyMetaEntity(level, day);
    current.spendEur += day.spendEur;
    current.adCostDzd += day.adCostDzd;
    current.impressions += day.impressions;
    current.clicks += day.clicks;
    current.linkClicks += day.linkClicks;
    current.outboundClicks += day.outboundClicks;
    current.uniqueOutboundClicks += day.uniqueOutboundClicks;
    current.landingPageViews += day.landingPageViews;
    current.addToCarts += day.addToCarts;
    current.checkouts += day.checkouts;
    current.metaPurchases += day.metaPurchases;
    current.purchaseValue += day.purchaseValue;
    current.videoPlays += day.videoPlays;
    current.videoP25Watched += day.videoP25Watched;
    current.videoP50Watched += day.videoP50Watched;
    current.videoP75Watched += day.videoP75Watched;
    current.videoP95Watched += day.videoP95Watched;
    current.videoP100Watched += day.videoP100Watched;
    current.videoWatchSecondsWeighted += day.videoAverageWatchSeconds * day.videoPlays;
    if (day.qualityRanking) current.qualityRanking = day.qualityRanking;
    if (day.engagementRateRanking) current.engagementRateRanking = day.engagementRateRanking;
    if (day.conversionRateRanking) current.conversionRateRanking = day.conversionRateRanking;
    rows.set(id, current);
  }

  for (const outcome of outcomes) {
    const id =
      level === 'campaign'
        ? outcome.campaignId
        : level === 'adset'
          ? outcome.adsetId
          : outcome.adId;
    if (!id) continue;
    const reference = namesByAdId.get(outcome.adId) ?? {
      campaignId: outcome.campaignId ?? '',
      campaignName: outcome.campaignId ?? '',
      adsetId: outcome.adsetId ?? '',
      adsetName: outcome.adsetId ?? '',
      adId: outcome.adId,
      adName: outcome.adId,
    };
    const current = rows.get(id) ?? emptyMetaEntity(level, reference);
    current.bricOrders += outcome.bricOrders;
    current.confirmedOrders += outcome.confirmedOrders;
    current.postedOrders += outcome.postedOrders;
    current.deliveredOrders += outcome.deliveredOrders;
    current.paidOrders += outcome.paidOrders;
    current.returnedOrders += outcome.returnedOrders;
    current.attributedAdCostDzd += (dailyByAdId.get(outcome.adId) ?? [])
      .filter((day) => !outcome.attributionStartDate || day.day >= outcome.attributionStartDate)
      .reduce((sum, day) => sum + day.adCostDzd, 0);
    current.projectedAdjustedProfitDzd += outcome.projectedAdjustedProfitDzd;
    current.automaticPaidProfitDzd += outcome.automaticPaidProfitDzd;
    current.profitCompleteOrders += outcome.profitCompleteOrders;
    rows.set(id, current);
  }

  return [...rows.values()]
    .map(finalizeMetaEntity)
    .sort((left, right) => right.spendEur - left.spendEur || right.bricOrders - left.bricOrders);
}
