import {
  type MetaAdsEnvironment,
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_META_GRAPH_ORIGIN,
} from './contract';

export class MetaAdsSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'MetaAdsSyncError';
  }
}

export function readMetaAdsConfig(env: MetaAdsEnvironment = process.env) {
  const accessToken = env.META_ADS_ACCESS_TOKEN?.trim() ?? '';
  const accountId = (env.META_AD_ACCOUNT_ID?.trim() ?? '').replace(/^act_/, '');
  const configuredVersion = env.META_ADS_GRAPH_API_VERSION?.trim() ?? DEFAULT_GRAPH_API_VERSION;
  const apiVersion = /^v\d+\.\d+$/.test(configuredVersion)
    ? configuredVersion
    : DEFAULT_GRAPH_API_VERSION;
  const configuredOrigin = (
    env.META_ADS_GRAPH_API_ORIGIN?.trim() || DEFAULT_META_GRAPH_ORIGIN
  ).replace(/\/+$/, '');
  let graphApiOrigin: string;
  try {
    const url = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/') throw new Error();
    graphApiOrigin = url.origin;
  } catch {
    throw new MetaAdsSyncError(
      'META_ADS_GRAPH_API_ORIGIN must be an HTTP or HTTPS origin.',
      'meta_ads_invalid_origin',
    );
  }

  if (!accessToken || !/^\d{6,30}$/.test(accountId)) {
    throw new MetaAdsSyncError(
      'Meta Ads Insights requires META_ADS_ACCESS_TOKEN and a numeric META_AD_ACCOUNT_ID.',
      'meta_ads_unconfigured',
    );
  }

  return { accessToken, accountId, apiVersion, graphApiOrigin };
}
