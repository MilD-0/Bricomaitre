import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const requests = [];
const shipments = new Map();

const locations = [
  { wilaya_id: 16, wilaya_name: 'Alger' },
  { wilaya_id: 9, wilaya_name: 'Blida' },
  { wilaya_id: 31, wilaya_name: 'Oran' },
  { wilaya_id: 19, wilaya_name: 'Sétif' },
  { wilaya_id: 25, wilaya_name: 'Constantine' },
];

const communes = {
  1601: { nom: 'Alger Centre', wilaya_id: 16, code_postal: '16000', has_stop_desk: 1 },
  1602: { nom: 'Bab Ezzouar', wilaya_id: 16, code_postal: '16042', has_stop_desk: 1 },
  901: { nom: 'Blida', wilaya_id: 9, code_postal: '09000', has_stop_desk: 1 },
  3101: { nom: 'Oran', wilaya_id: 31, code_postal: '31000', has_stop_desk: 1 },
  1901: { nom: 'Sétif', wilaya_id: 19, code_postal: '19000', has_stop_desk: 1 },
  2501: { nom: 'Constantine', wilaya_id: 25, code_postal: '25000', has_stop_desk: 1 },
};

const rates = new Map([
  [16, [500, 350]],
  [9, [550, 400]],
  [31, [800, 550]],
  [19, [750, 500]],
  [25, [750, 500]],
]);

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-ratelimit-limit': '120',
    'x-ratelimit-remaining': '119',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function noContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function record(method, pathname, status, service) {
  requests.unshift({ at: new Date().toISOString(), method, pathname, status, service });
  if (requests.length > 200) requests.length = 200;
}

function trackingState(tracking) {
  if (shipments.has(tracking)) return shipments.get(tracking);
  const suffix = Number.parseInt(tracking.replace(/\D/g, '').slice(-2) || '0', 10);
  const status = ['en_livraison', 'livre_non_encaisse', 'payed', 'retour_archive'][suffix % 4];
  return {
    tracking,
    reference: tracking.replace(/\D/g, '').slice(-5) || '1',
    status,
    amount: 12_500 + (suffix % 6) * 1_500,
    provider: tracking.startsWith('EM') ? 'emir' : 'delivro',
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  };
}

function orderInfo(state) {
  return {
    tracking: state.tracking,
    reference: state.reference,
    montant: String(state.amount),
    tarif_prestation: '500',
    tarif_retour: state.status === 'retour_archive' ? '250' : '0',
    stop_desk: 0,
    payment_id: ['payed', 'paye_et_archive'].includes(state.status)
      ? `PAY-${state.tracking}`
      : null,
    status_reason: null,
    created_at: state.createdAt,
    last_updated_at: new Date().toISOString(),
    livred_at: ['livre_non_encaisse', 'payed', 'paye_et_archive'].includes(state.status)
      ? new Date().toISOString()
      : null,
  };
}

function trackingInfo(state) {
  return {
    recipientName: 'Client démo',
    shippedBy: state.provider === 'emir' ? 'Emir Demo' : 'Delivro Demo',
    originCity: 16,
    destLocationCity: 16,
    status: state.status,
    OrderInfo: orderInfo(state),
    deliveryAttempts: [],
    activity: [
      {
        date: new Date().toISOString().slice(0, 10),
        time: '10:30',
        status: state.status,
        scanLocation: 'Centre de démonstration',
      },
    ],
  };
}

function ecotrackFees() {
  const serviceRows = [...rates].map(([wilaya, [home, desk]]) => ({
    wilaya_id: wilaya,
    tarif: String(home),
    tarif_stopdesk: String(desk),
  }));
  const weight = {
    surfacturation_a_domicile_DA: '100',
    surfacturation_stopdesk_DA: '100',
    pour_chaque_KG: '50',
    a_partir_de_KG: '5',
  };
  return {
    livraison: serviceRows,
    pickup: serviceRows,
    echange: serviceRows,
    recouvrement: serviceRows,
    retours: serviceRows,
    poids: { livraison: weight, pickup: weight, echange: weight, recouvrement: weight },
  };
}

async function handleEcotrack(request, response, url) {
  const route = url.pathname.replace(/^\/ecotrack\/(?:delivro|emir)\/api\/v1/, '');
  const provider = url.pathname.includes('/emir/') ? 'emir' : 'delivro';

  if (route === '/validate/token')
    return json(response, 200, { success: true, message: 'Demo token accepted.' });
  if (route === '/get/wilayas') return json(response, 200, locations);
  if (route === '/get/communes') return json(response, 200, communes);
  if (route === '/get/fees') return json(response, 200, ecotrackFees());

  if (route === '/create/orders') {
    const body = await readJson(request);
    const results = {};
    for (const [index, input] of Object.entries(body.orders ?? {})) {
      const reference = String(input.reference ?? index);
      const tracking = `${provider === 'emir' ? 'EM' : 'DL'}D${reference.padStart(8, '0')}`;
      shipments.set(tracking, {
        tracking,
        reference,
        status: 'en_preparation',
        amount: Number(input.montant ?? 0),
        provider,
        createdAt: new Date().toISOString(),
      });
      results[reference] = { success: true, tracking, message: 'Order created in demo carrier.' };
    }
    return json(response, 200, { success: true, results });
  }

  if (route === '/get/orders/status') {
    const trackings = (url.searchParams.get('trackings') ?? '').split(',').filter(Boolean);
    const data = Object.fromEntries(
      trackings.map((tracking) => {
        const state = trackingState(tracking);
        return [
          tracking,
          {
            status: state.status,
            order_id: state.reference,
            desk_phone: '0000000000',
            desk_commune: 'Alger Centre',
            desk_map_link: 'https://example.invalid/demo-desk',
            desk_address: 'Adresse de démonstration',
            driver_phone: '0000000000',
            estimated_fee: '500',
            activity: [],
          },
        ];
      }),
    );
    return json(response, 200, { success: true, data });
  }

  if (route === '/get/trackings/info') {
    const trackings = url.searchParams.getAll('trackings[]');
    return json(
      response,
      200,
      Object.fromEntries(
        trackings.map((tracking) => [tracking, trackingInfo(trackingState(tracking))]),
      ),
    );
  }

  if (route === '/get/tracking/info') {
    const state = trackingState(url.searchParams.get('tracking') ?? 'DLD00000001');
    return json(response, 200, trackingInfo(state));
  }

  if (route === '/get/maj') {
    const tracking = url.searchParams.get('tracking') ?? 'DLD00000001';
    return json(response, 200, [
      {
        remarque: 'Suivi de démonstration',
        station: 'Alger',
        livreur: 'Équipe démo',
        created_at: new Date().toISOString(),
        tracking,
      },
    ]);
  }

  if (route === '/get/orders') {
    const rows = [...shipments.values()].map((state) => ({
      ...orderInfo(state),
      status: state.status,
    }));
    return json(response, 200, { current_page: 1, last_page: 1, next_page_url: null, data: rows });
  }

  if (route === '/get/order/label') {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    );
    response.writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="demo-label.pdf"',
    });
    return response.end(pdf);
  }

  if (
    [
      '/update/order',
      '/delete/order',
      '/valid/order',
      '/add/maj',
      '/ask/for/order/return',
    ].includes(route)
  ) {
    const tracking = url.searchParams.get('tracking');
    if (tracking) {
      const state = trackingState(tracking);
      if (route === '/delete/order') shipments.delete(tracking);
      else if (route === '/valid/order')
        shipments.set(tracking, { ...state, status: 'en_livraison' });
      else if (route === '/ask/for/order/return')
        shipments.set(tracking, { ...state, status: 'retour_demande' });
      else shipments.set(tracking, state);
    }
    return json(response, 200, { success: true, message: 'Demo carrier mutation accepted.' });
  }

  return json(response, 404, { success: false, message: `Unknown demo carrier route: ${route}` });
}

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

async function handleMeta(request, response, url) {
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

async function handleGoogle(request, response, url) {
  if (url.pathname === '/google/oauth2/token') {
    return json(response, 200, {
      access_token: 'demo-google-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }
  if (url.pathname === '/google/mp/collect') {
    await readJson(request);
    return noContent(response);
  }
  if (url.pathname.endsWith('/searchAnalytics/query')) {
    const body = await readJson(request);
    const dimensions = body.dimensions ?? [];
    const day = body.endDate ?? new Date().toISOString().slice(0, 10);
    const values = {
      date: day,
      query: 'perceuse sans fil',
      page: 'https://demo.bricomaitre.invalid/fr/products/perceuse-sans-fil',
      country: 'dza',
      device: 'MOBILE',
      searchAppearance: 'MERCHANT_LISTINGS',
    };
    return json(response, 200, {
      rows: [
        {
          keys: dimensions.map((key) => values[key] ?? 'demo'),
          clicks: 42,
          impressions: 860,
          ctr: 0.0488,
          position: 6.4,
        },
      ],
    });
  }
  if (url.pathname.endsWith('/sitemaps')) {
    return json(response, 200, {
      sitemap: [
        {
          path: 'https://demo.bricomaitre.invalid/sitemap.xml',
          type: 'sitemap',
          isPending: false,
          warnings: 0,
          errors: 0,
          contents: [{ type: 'web', submitted: 12, indexed: 12 }],
        },
      ],
    });
  }
  if (url.pathname === '/google/urlInspection/index:inspect') {
    const body = await readJson(request);
    return json(response, 200, {
      inspectionResult: {
        inspectionUrl: body.inspectionUrl,
        indexStatusResult: {
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          pageFetchState: 'SUCCESSFUL',
          googleCanonical: body.inspectionUrl,
          userCanonical: body.inspectionUrl,
          lastCrawlTime: new Date().toISOString(),
          crawledAs: 'MOBILE',
        },
        richResultsResult: {},
      },
    });
  }
  return json(response, 404, { error: { message: 'Unknown demo Google route.' } });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  let service = 'demo';
  try {
    if (url.pathname === '/health')
      return json(response, 200, {
        ok: true,
        services: ['ecotrack-delivro', 'ecotrack-emir', 'meta', 'google', 'tiktok'],
      });
    if (url.pathname === '/__demo/requests') return json(response, 200, { requests });
    if (url.pathname === '/__demo/state')
      return json(response, 200, {
        shipments: [...shipments.values()],
        requestCount: requests.length,
      });
    if (url.pathname === '/__demo/reset' && request.method === 'POST') {
      shipments.clear();
      requests.length = 0;
      return json(response, 200, { ok: true });
    }
    if (url.pathname.startsWith('/ecotrack/')) {
      service = 'ecotrack';
      return await handleEcotrack(request, response, url);
    }
    if (url.pathname.startsWith('/meta/') || /^\/v\d+[.]\d+\//.test(url.pathname)) {
      service = 'meta';
      return await handleMeta(request, response, url);
    }
    if (url.pathname.startsWith('/google/')) {
      service = 'google';
      return await handleGoogle(request, response, url);
    }
    if (url.pathname.startsWith('/tiktok/')) {
      service = 'tiktok';
      await readJson(request);
      return json(response, 200, { code: 0, message: 'OK', request_id: 'demo-tiktok-request' });
    }
    return json(response, 404, { error: 'Unknown demo provider route.' });
  } catch (error) {
    return json(response, 500, {
      error: error instanceof Error ? error.message : 'Mock failure.',
    });
  } finally {
    if (!url.pathname.startsWith('/__demo/') && url.pathname !== '/health')
      record(request.method ?? 'GET', url.pathname, response.statusCode, service);
  }
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Bricomaitre demo provider simulator listening on ${port}.\n`);
});
