import { json, readJson } from './mock-http.mjs';
import { communes, locations, rates, shipments } from './mock-state.mjs';

function trackingState(tracking) {
  return shipments.get(tracking);
}

function orderInfo(state) {
  return {
    ...state.input,
    tracking: state.tracking,
    reference: state.reference,
    montant: String(state.amount),
    tarif_prestation: '500',
    tarif_retour: state.status === 'retour_archive' ? '250' : '0',
    stop_desk: Number(state.input?.stop_desk ?? 0),
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
    recipientName: state.input?.nom_client ?? 'Client démo',
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

function shipmentLabel(tracking) {
  const text = `Demo shipment ${tracking}`.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
  const content = `BT /F1 18 Tf 40 760 Td (${text}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}

function ecotrackFees() {
  const serviceRows = [...rates].map(([wilaya, [home, desk]]) => ({
    wilaya_id: wilaya,
    tarif: String(home),
    tarif_stopdesk: String(desk),
  }));
  const weight = {
    surfacturation_a_domicile_DA: '100',
    surfacturation_stopdesk_DA: '75',
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

export async function handleEcotrack(request, response, url) {
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
        status: 'prete_a_expedier',
        input,
        updates: [],
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
      trackings
        .filter((tracking) => shipments.has(tracking))
        .map((tracking) => {
          const state = trackingState(tracking);
          return [
            tracking,
            {
              status: state.status,
              order_id: state.reference,
              desk_phone: '0550000000',
              desk_commune: 'Alger Centre',
              desk_map_link: 'https://example.invalid/demo-desk',
              desk_address: 'Adresse de démonstration',
              driver_phone: '0770000000',
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
        trackings
          .filter((tracking) => shipments.has(tracking))
          .map((tracking) => [tracking, trackingInfo(trackingState(tracking))]),
      ),
    );
  }

  if (route === '/get/tracking/info') {
    const state = trackingState(url.searchParams.get('tracking') ?? 'DLD00000001');
    if (!state) return json(response, 404, { success: false, message: 'Shipment not found.' });
    return json(response, 200, trackingInfo(state));
  }

  if (route === '/get/maj') {
    const tracking = url.searchParams.get('tracking') ?? 'DLD00000001';
    const state = trackingState(tracking);
    if (!state) return json(response, 404, { success: false, message: 'Shipment not found.' });
    return json(response, 200, state.updates ?? []);
  }

  if (route === '/get/orders') {
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const tracking = url.searchParams.get('tracking');
    const start = url.searchParams.get('start_date');
    const end = url.searchParams.get('end_date');
    const rows = [];
    let total = 0;
    for (const state of shipments.values()) {
      if (state.provider !== provider || (tracking && state.tracking !== tracking)) continue;
      const day = state.createdAt.slice(0, 10);
      if ((start && day < start) || (end && day > end)) continue;
      if (total >= (page - 1) * 100 && rows.length < 100) {
        rows.push({ ...orderInfo(state), status: state.status });
      }
      total += 1;
    }
    const lastPage = Math.max(1, Math.ceil(total / 100));
    return json(response, 200, {
      current_page: page,
      last_page: lastPage,
      next_page_url: page < lastPage ? `?page=${page + 1}` : null,
      data: rows,
    });
  }

  if (route === '/get/order/label') {
    const tracking = url.searchParams.get('tracking') ?? '';
    if (!shipments.has(tracking))
      return json(response, 404, { success: false, message: 'Shipment not found.' });
    const pdf = shipmentLabel(tracking);
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
    if (!tracking || !shipments.has(tracking))
      return json(response, 404, { success: false, message: 'Shipment not found.' });
    if (tracking) {
      const state = trackingState(tracking);
      if (route === '/delete/order') shipments.delete(tracking);
      else if (route === '/valid/order')
        shipments.set(tracking, { ...state, status: 'en_ramassage' });
      else if (route === '/ask/for/order/return')
        shipments.set(tracking, { ...state, status: 'retour_en_traitement' });
      else if (route === '/add/maj') {
        const update = {
          remarque: url.searchParams.get('content') ?? '',
          station: 'Alger',
          livreur: 'Équipe démo',
          created_at: new Date().toISOString(),
          tracking,
        };
        shipments.set(tracking, { ...state, updates: [...(state.updates ?? []), update] });
      } else {
        const input = { ...state.input, ...Object.fromEntries(url.searchParams) };
        shipments.set(tracking, { ...state, input, amount: Number(input.montant ?? state.amount) });
      }
    }
    return json(response, 200, { success: true, message: 'Demo carrier mutation accepted.' });
  }

  return json(response, 404, { success: false, message: `Unknown demo carrier route: ${route}` });
}
