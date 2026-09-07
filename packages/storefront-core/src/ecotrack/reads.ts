import { z } from 'zod';
import { type EcotrackExtendedRateLimitSnapshot } from './contract';
import { readEcotrackRejected } from './errors';
import {
  ecotrackMajEntrySchema,
  ecotrackOrdersPageSchema,
  ecotrackStatusItemSchema,
  ecotrackTrackingInfoSchema,
  type EcotrackOrderSummary,
  type EcotrackStatusItem,
  type EcotrackTrackingInfo,
} from './schemas';
import { requestEcotrack } from './transport';

export async function getEcotrackMaj(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/maj',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    ...result,
    data: z.array(ecotrackMajEntrySchema).parse(result.payload),
  };
}

export async function getEcotrackTrackingInfo(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/tracking/info',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    ...result,
    data: ecotrackTrackingInfoSchema.parse(result.payload),
  };
}

export async function getEcotrackTrackingsInfo(
  trackings: string[],
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const queryString = trackings
    .map((tracking) => `trackings[]=${encodeURIComponent(tracking)}`)
    .join('&');
  const result = await requestEcotrack({
    path: queryString ? `/get/trackings/info?${queryString}` : '/get/trackings/info',
    method: 'GET',
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  if (readEcotrackRejected(result.payload))
    throw new Error('ECOTRACK rejected the shipment lookup.');
  const payload = z.record(z.string(), z.unknown()).parse(result.payload);
  z.record(z.string(), ecotrackTrackingInfoSchema).parse(payload);
  const normalized = new Map<string, EcotrackTrackingInfo>();
  const rawData = new Map<string, unknown>();
  for (const tracking of trackings) {
    const raw = payload[tracking];
    if (!raw) continue;
    rawData.set(tracking, raw);
    normalized.set(tracking, ecotrackTrackingInfoSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
    rawData,
  };
}

export async function getEcotrackOrdersStatus(
  trackings: string[],
  status = 'all',
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/orders/status',
    method: 'GET',
    query: {
      trackings: trackings.join(','),
      status,
    },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  if (readEcotrackRejected(result.payload))
    throw new Error('ECOTRACK rejected the shipment lookup.');
  const payload = z.record(z.string(), z.unknown()).parse(result.payload);
  const rawData = z.record(z.string(), z.unknown()).parse(payload.data);
  const normalized = new Map<string, EcotrackStatusItem>();
  const rawItems = new Map<string, unknown>();
  for (const tracking of trackings) {
    const raw = rawData[tracking];
    if (!raw) continue;
    rawItems.set(tracking, raw);
    normalized.set(tracking, ecotrackStatusItemSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
    rawData: rawItems,
  };
}

export async function getEcotrackOrdersPage(
  options: {
    page?: number;
    startDate?: string;
    endDate?: string;
    tracking?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/orders',
    method: 'GET',
    query: {
      page: options.page,
      start_date: options.startDate,
      end_date: options.endDate,
      tracking: options.tracking,
    },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });
  const rawPage =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  if (readEcotrackRejected(result.payload))
    throw new Error('ECOTRACK rejected the current-orders lookup.');
  const page = ecotrackOrdersPageSchema.parse(rawPage);
  const rawRows = Array.isArray(rawPage.data) ? rawPage.data : [];
  const rawData = new Map<string, unknown>();
  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue;
    const tracking = (raw as Record<string, unknown>).tracking;
    if (typeof tracking === 'string' && tracking.trim()) rawData.set(tracking, raw);
  }
  return { ...result, data: page.data, page, rawData };
}

export async function listEcotrackOrders(
  options: {
    startDate?: string;
    endDate?: string;
    maxPages?: number;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const maxPages = Math.min(100, Math.max(1, Math.trunc(options.maxPages ?? 100)));
  const data: EcotrackOrderSummary[] = [];
  const rawData = new Map<string, unknown>();
  const rateLimits: EcotrackExtendedRateLimitSnapshot[] = [];
  let pageNumber = 1;
  let lastPage = 1;

  do {
    const result = await getEcotrackOrdersPage({ ...options, page: pageNumber });
    data.push(...result.data);
    for (const [tracking, raw] of result.rawData) rawData.set(tracking, raw);
    rateLimits.push(result.rateLimit);
    const parsedLastPage = Number(result.page.last_page ?? pageNumber);
    lastPage = Number.isFinite(parsedLastPage) ? Math.max(pageNumber, parsedLastPage) : pageNumber;
    pageNumber += 1;
  } while (pageNumber <= lastPage && pageNumber <= maxPages);

  return {
    data,
    rawData,
    pagesFetched: pageNumber - 1,
    truncated: lastPage >= pageNumber && pageNumber > maxPages,
    rateLimits,
  };
}

export async function getEcotrackOrder(
  tracking: string,
  options: {
    startDate?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await getEcotrackOrdersPage({
    tracking,
    startDate: options.startDate,
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  const data = result.data.find((order) => order.tracking === tracking) ?? null;
  if (
    !data &&
    (result.data.length > 0 ||
      result.page.next_page_url ||
      Number(result.page.last_page ?? 1) > Number(result.page.current_page ?? 1))
  ) {
    throw new Error('ECOTRACK current-orders lookup did not establish absence.');
  }
  return {
    ...result,
    data,
    raw: result.rawData.get(tracking) ?? null,
  };
}
