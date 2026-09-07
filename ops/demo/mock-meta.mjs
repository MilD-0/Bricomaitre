import { json, readJson } from './mock-http.mjs';

function metaInsightRows(url) {
  let range = {};
  try {
    range = JSON.parse(url.searchParams.get('time_range') ?? '{}');
  } catch {}
  const until = range.until ? new Date(`${range.until}T00:00:00Z`) : new Date();
  const since = range.since ? new Date(`${range.since}T00:00:00Z`) : until;
  const breakdowns = url.searchParams.get('breakdowns') ?? '';
  const rows = [];
  for (
    let day = new Date(since), i = 0;
    day <= until;
    day.setUTCDate(day.getUTCDate() + 1), i += 1
  ) {
    const purchases = 3 + (i % 5);
    rows.push({
      date_start: day.toISOString().slice(0, 10),
      account_id: '100000000001',
      account_currency: 'EUR',
      campaign_id: '200000000001',
      campaign_name: 'Catalogue démonstration',
      adset_id: '300000000001',
      adset_name: 'Outillage mobile',
      ad_id: '400000000001',
      ad_name: 'Produit vedette',
      objective: 'OUTCOME_SALES',
      attribution_setting: '7d_click,1d_view',
      spend: String(18 + (i % 4)),
      impressions: String(4600 + i * 31),
      reach: String(3500 + i * 23),
      clicks: String(125 + (i % 20)),
      inline_link_clicks: String(98 + (i % 16)),
      outbound_clicks: [{ action_type: 'outbound_click', value: String(90 + (i % 14)) }],
      unique_outbound_clicks: [{ action_type: 'outbound_click', value: String(78 + (i % 12)) }],
      actions: [
        { action_type: 'landing_page_view', value: String(82 + (i % 11)) },
        { action_type: 'add_to_cart', value: String(16 + (i % 4)) },
        { action_type: 'initiate_checkout', value: String(9 + (i % 3)) },
        { action_type: 'purchase', value: String(purchases) },
      ],
      action_values: [{ action_type: 'purchase', value: String(purchases * 14_000) }],
      publisher_platform: breakdowns.includes('publisher_platform') ? 'facebook' : undefined,
      platform_position: breakdowns.includes('platform_position') ? 'feed' : undefined,
      impression_device: breakdowns.includes('impression_device') ? 'mobile_app' : undefined,
      region: breakdowns === 'region' ? 'Alger' : undefined,
    });
  }
  return rows;
}

export async function handleMeta(request, response, url) {
  if (/\/v\d+\.\d+\/demo-pixel\/events$/.test(url.pathname)) {
    await readJson(request);
    return json(response, 200, { events_received: 1, messages: [], fbtrace_id: 'demo-trace' });
  }
  if (/\/v\d+\.\d+\/act_\d+$/.test(url.pathname)) {
    return json(response, 200, {
      id: 'act_100000000001',
      currency: 'EUR',
      timezone_name: 'Africa/Algiers',
    });
  }
  if (url.pathname.endsWith('/insights'))
    return json(response, 200, { data: metaInsightRows(url) });
  if (url.pathname.endsWith('/campaigns')) {
    return json(response, 200, {
      data: [
        {
          id: '200000000001',
          name: 'Catalogue démonstration',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          objective: 'OUTCOME_SALES',
          daily_budget: '2500',
          budget_remaining: '18000',
        },
      ],
    });
  }
  if (url.pathname.endsWith('/adsets')) {
    return json(response, 200, {
      data: [
        {
          id: '300000000001',
          campaign_id: '200000000001',
          name: 'Outillage mobile',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget: '2500',
          budget_remaining: '18000',
        },
      ],
    });
  }
  return json(response, 404, { error: { message: 'Unknown demo Meta route.' } });
}
