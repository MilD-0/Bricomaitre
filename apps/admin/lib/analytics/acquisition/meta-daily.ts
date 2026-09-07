import type { AnalyticsEntityLevel } from '../contract';
import { type AnalyticsMetaEntity } from '../loaders-shared';
import { type MetaDailyRow } from './meta-entities';

export function buildMetaDailyByLevel(
  level: AnalyticsEntityLevel,
  daily: MetaDailyRow[],
  entities: AnalyticsMetaEntity[],
) {
  const topIds = new Set(entities.slice(0, 24).map((entity) => entity.id));
  const rows = new Map<
    string,
    {
      day: string;
      id: string;
      name: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const source of daily) {
    const id =
      level === 'campaign' ? source.campaignId : level === 'adset' ? source.adsetId : source.adId;
    if (!topIds.has(id)) continue;
    const name =
      level === 'campaign'
        ? source.campaignName
        : level === 'adset'
          ? source.adsetName
          : source.adName;
    const key = `${source.day}\u0000${id}`;
    const current = rows.get(key) ?? {
      day: source.day,
      id,
      name: name || id,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += source.spendEur;
    current.adCostDzd += source.adCostDzd;
    current.impressions += source.impressions;
    current.linkClicks += source.linkClicks;
    current.outboundClicks += source.outboundClicks;
    rows.set(key, current);
  }
  return [...rows.values()]
    .map((row) => ({ day: row.day, id: row.id, name: row.name, adCostDzd: row.adCostDzd }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

export function aggregateMetaDaily(
  rows: Array<{
    day: string;
    spendEur: number;
    adCostDzd: number;
    impressions: number;
    linkClicks: number;
    outboundClicks: number;
  }>,
) {
  const groups = new Map<
    string,
    {
      day: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const row of rows) {
    const current = groups.get(row.day) ?? {
      day: row.day,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += row.spendEur;
    current.adCostDzd += row.adCostDzd;
    current.impressions += row.impressions;
    current.linkClicks += row.linkClicks;
    current.outboundClicks += row.outboundClicks;
    groups.set(row.day, current);
  }
  return [...groups.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((row) => ({
      ...row,
      ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
      outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
      cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    }));
}
