import { catalogProducts, ecotrackCatalog } from './fixture-catalog.mjs';

let nextOrderId = 100;

export const orders = new Map();

export function json(response, status = 200) {
  return { status, body: JSON.stringify(response), type: 'application/json' };
}

export function send(response, result) {
  response.writeHead(result.status, { 'content-type': result.type, 'cache-control': 'no-store' });
  response.end(result.body);
}

export function createOrder(payload) {
  const id = nextOrderId++;
  const publicToken = `fixture-public-order-token-${id}-1234567890`;
  const quantities = new Map();
  for (const token of payload.cartProducts ?? [])
    quantities.set(token, (quantities.get(token) ?? 0) + 1);
  const orderProducts = [...quantities].map(([rawValue, quantity]) => {
    const item = catalogProducts.find(
      (entry) => entry.slug === rawValue || String(entry.id) === rawValue,
    );
    const unitPrice = Number(item?.price ?? 0);
    return {
      productId: item?.id ?? null,
      brandId: item?.brandId ?? null,
      slug: item?.slug ?? null,
      rawValue,
      title: item?.title ?? rawValue,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      thumbnailUrl: item?.images[0] ?? null,
      missing: !item,
    };
  });
  const productSubtotal = orderProducts.reduce((sum, item) => sum + item.lineTotal, 0);
  const fee = ecotrackCatalog.serviceFees.find((entry) => entry.wilayaId === payload.state);
  const deliveryFee = Number(
    payload.delivery === 1 ? (fee?.stopDeskFee ?? 0) : (fee?.homeFee ?? 0),
  );
  const now = new Date().toISOString();
  const order = {
    id,
    publicToken,
    createdAt: now,
    updatedAt: now,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    fullName: [payload.firstName, payload.lastName].filter(Boolean).join(' '),
    email: payload.email ?? null,
    phoneNumber1: payload.phoneNumber1,
    phoneNumber2: payload.phoneNumber2 ?? null,
    cartProducts: payload.cartProducts,
    orderProducts,
    delivery: payload.delivery,
    state: payload.state,
    city: payload.city,
    homeAddress: payload.homeAddress ?? null,
    productSubtotal,
    deliveryFee,
    totalAmount: productSubtotal + deliveryFee,
    promoCode: null,
    promoProductId: null,
    promoOriginalSubtotal: null,
    promoDiscountAmount: 0,
    promoFinalSubtotal: null,
    note: null,
    inHouseStatus: 0,
    noAnswerCount: 0,
    confirmedAt: null,
    hasStatusHistory: false,
    statusHistory: [],
  };
  orders.set(id, order);
  return order;
}
