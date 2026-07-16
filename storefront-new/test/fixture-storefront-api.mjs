import { createServer } from 'node:http';

const product = {
  id: 12,
  canonicalToken: 'desk-lamp',
  title: 'Lampe de travail',
  titleAr: 'مصباح العمل',
  description: 'Une lumière stable et puissante pour vos travaux, avec un format compact facile à déplacer.',
  descriptionAr: 'إضاءة قوية وثابتة لأعمالك، بتصميم مدمج وسهل النقل.',
  sku: 'DL-1',
  barcode: null,
  price: '4500.00',
  oldPrice: '5200.00',
  availability: { status: 'in_stock', inStock: true, quantity: 4 },
  media: [
    { url: 'http://127.0.0.1:3003/product-placeholder.svg', position: 0, width: 900, height: 900, blurDataUrl: null },
    { url: 'http://127.0.0.1:3003/product-placeholder.svg?view=2', position: 1, width: 900, height: 900, blurDataUrl: null },
  ],
  brand: { id: 2, name: 'Bric Pro', slug: 'bric-pro', image: 'http://127.0.0.1:3003/brand-placeholder.svg' },
  category: { id: 3, name: 'Éclairage', nameAr: 'الإضاءة', slug: 'lighting', image: null, parentId: 5, properties: [] },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

const catalogProducts = [
  {
    id: 12,
    slug: 'desk-lamp',
    mongoId: 'legacy-lamp',
    title: 'Lampe de travail',
    titleAr: 'مصباح العمل',
    description: product.description,
    descriptionAr: product.descriptionAr,
    sku: 'DL-1',
    barcode: null,
    price: '4500.00',
    oldPrice: '5200.00',
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 4,
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg'],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  },
  {
    id: 42,
    slug: 'work-light-tripod',
    mongoId: null,
    title: 'Projecteur de chantier sur trépied',
    titleAr: 'كشاف ورشة على حامل',
    description: 'Un éclairage stable pour les chantiers et ateliers.',
    descriptionAr: 'إضاءة ثابتة للورشات ومواقع العمل.',
    sku: 'WL-42',
    barcode: null,
    price: '7200.00',
    oldPrice: null,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 3,
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg?light=2'],
    createdAt: '2026-06-29T10:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  },
  {
    id: 13,
    slug: 'impact-drill',
    mongoId: null,
    title: 'Perceuse à percussion',
    titleAr: 'مثقاب طرقي',
    description: 'Une perceuse compacte pour les travaux courants.',
    descriptionAr: 'مثقاب مدمج للأعمال اليومية.',
    sku: 'PD-13',
    barcode: null,
    price: '8900.00',
    oldPrice: null,
    active: true,
    inStock: false,
    availabilityStatus: 'out_of_stock',
    inventoryQuantity: 0,
    brandId: 2,
    categoryId: 4,
    images: ['/product-placeholder.svg?drill=1'],
    createdAt: '2026-06-28T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  },
];

for (let id = 14; id <= 41; id += 1) {
  catalogProducts.push({
    id,
    slug: `workshop-tool-${id}`,
    mongoId: null,
    title: `Outil d’atelier ${id}`,
    titleAr: `أداة ورشة ${id}`,
    description: 'Un outil fiable pour les travaux courants.',
    descriptionAr: 'أداة موثوقة للأعمال اليومية.',
    sku: `WT-${id}`,
    barcode: null,
    price: `${3000 + id * 100}.00`,
    oldPrice: null,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 5,
    brandId: 2,
    categoryId: 4,
    images: ['/product-placeholder.svg?tool=1'],
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: `2026-06-${String(Math.min(28, id)).padStart(2, '0')}T10:00:00.000Z`,
  });
}

for (let id = 43; id <= 50; id += 1) {
  catalogProducts.push({
    id,
    slug: `work-light-${id}`,
    mongoId: null,
    title: `Éclairage de chantier ${id}`,
    titleAr: `إضاءة ورشة ${id}`,
    description: 'Un éclairage complémentaire pour les travaux.',
    descriptionAr: 'إضاءة إضافية لأعمال الورشة.',
    sku: `WL-${id}`,
    barcode: null,
    price: `${5000 + id * 50}.00`,
    oldPrice: null,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 4,
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg?light=3'],
    createdAt: '2026-06-21T10:00:00.000Z',
    updatedAt: `2026-06-${String(id - 20).padStart(2, '0')}T10:00:00.000Z`,
  });
}

function homepage() {
  return {
  banners: [
    {
      id: 1,
      title: 'Puissance pour vos travaux',
      titleAr: 'قوة لأعمالكم',
      imageUrl: 'http://127.0.0.1:3003/mock/banner-power-wide.svg',
      imageUrlPortrait: 'http://127.0.0.1:3003/mock/banner-power-portrait.svg',
      imageUrlLandscape: 'http://127.0.0.1:3003/mock/banner-power-wide.svg',
      productId: 12,
      sortOrder: 0,
      active: true,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
    },
    {
      id: 2,
      title: 'Équipez votre atelier',
      titleAr: 'جهزوا ورشتكم',
      imageUrl: 'http://127.0.0.1:3003/mock/banner-workshop-wide.svg',
      imageUrlPortrait: 'http://127.0.0.1:3003/mock/banner-workshop-portrait.svg',
      imageUrlLandscape: 'http://127.0.0.1:3003/mock/banner-workshop-wide.svg',
      productId: 13,
      sortOrder: 1,
      active: true,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
    },
  ],
  topProducts: catalogProducts.slice(0, 6),
  categories,
  productCards: [
    {
      id: 1,
      productId: 12,
      titleAr: 'إضاءة موثوقة لكل ورشة',
      titleFr: 'Une lumière fiable pour chaque atelier',
      descriptionAr: 'إضاءة قوية وثابتة للأعمال اليومية.',
      descriptionFr: 'Une lumière stable et puissante pour les travaux du quotidien.',
      characteristicsAr: ['إضاءة قوية', 'سهل النقل'],
      characteristicsFr: ['Éclairage puissant', 'Facile à déplacer'],
      sortOrder: 0,
      active: true,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
      product: catalogProducts[0],
    },
    {
      id: 2,
      productId: 13,
      titleAr: 'قوة مدمجة للأعمال اليومية',
      titleFr: 'La puissance compacte du quotidien',
      descriptionAr: 'مثقاب عملي للأعمال المتكررة.',
      descriptionFr: 'Une perceuse pratique pour les travaux courants.',
      characteristicsAr: ['حجم مدمج', 'استخدام سهل'],
      characteristicsFr: ['Format compact', 'Prise en main simple'],
      sortOrder: 1,
      active: true,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
      product: catalogProducts[2],
    },
  ],
  brands,
  featuredGroups: [{
    id: 1,
    name: 'Pour équiper votre atelier',
    nameAr: 'لتجهيز ورشتكم',
    cta: 'Voir la sélection',
    ctaAr: 'عرض المجموعة',
    link: '/products',
    sortOrder: 0,
    showAtTopOfProductsPage: true,
    active: true,
    productIds: catalogProducts.slice(0, 6).map((item) => item.id),
    brandIds: [],
    categoryIds: [],
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
    products: catalogProducts.slice(0, 6),
  }, {
    id: 2,
    name: 'Les indispensables du chantier',
    nameAr: 'أساسيات الورشة',
    cta: 'Explorer la sélection',
    ctaAr: 'استكشف المجموعة',
    link: '/products?category=4',
    sortOrder: 1,
    showAtTopOfProductsPage: false,
    active: true,
    productIds: catalogProducts.slice(2, 8).map((item) => item.id),
    brandIds: [],
    categoryIds: [],
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
    products: catalogProducts.slice(2, 8),
  }],
  };
}

const brands = [{
  id: 2,
  name: 'Bric Pro',
  slug: 'bric-pro',
  image: '/brand-placeholder.svg',
  featured: true,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
}];

const categories = [
  { id: 5, name: 'Équipement d’atelier', slug: 'workshop-equipment', nameEn: 'Workshop equipment', nameAr: 'معدات الورشة', image: null, parentId: null, properties: [], featured: false, createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
  { id: 3, name: 'Éclairage', slug: 'lighting', nameEn: 'Lighting', nameAr: 'الإضاءة', image: null, parentId: 5, properties: [], featured: true, createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
  { id: 4, name: 'Outillage électrique', slug: 'power-tools', nameEn: 'Power tools', nameAr: 'أدوات كهربائية', image: null, parentId: null, properties: [], featured: true, createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
];

const ecotrackCatalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }, { wilayaId: 31, name: 'Oran' }],
  communes: [
    { communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true },
    { communeId: 2, wilayaId: 31, name: 'Oran', postalCode: '31000', hasStopDesk: false },
  ],
  serviceFees: [
    { serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' },
    { serviceType: 'livraison', wilayaId: 31, homeFee: '700', stopDeskFee: '500' },
  ],
  weightFees: [],
  lastSync: null,
};

let nextOrderId = 100;
const orders = new Map();

function json(response, status = 200) {
  return { status, body: JSON.stringify(response), type: 'application/json' };
}

function send(response, result) {
  response.writeHead(result.status, { 'content-type': result.type, 'cache-control': 'no-store' });
  response.end(result.body);
}

function createOrder(payload) {
  const id = nextOrderId++;
  const publicToken = `fixture-public-order-token-${id}-1234567890`;
  const quantities = new Map();
  for (const token of payload.cartProducts ?? []) quantities.set(token, (quantities.get(token) ?? 0) + 1);
  const orderProducts = [...quantities].map(([rawValue, quantity]) => {
    const item = catalogProducts.find((entry) => entry.slug === rawValue || String(entry.id) === rawValue);
    const unitPrice = Number(item?.price ?? 0);
    return { productId: item?.id ?? null, brandId: item?.brandId ?? null, rawValue, title: item?.title ?? rawValue, unitPrice, quantity, lineTotal: unitPrice * quantity, thumbnailUrl: item?.images[0] ?? null, missing: !item };
  });
  const productSubtotal = orderProducts.reduce((sum, item) => sum + item.lineTotal, 0);
  const fee = ecotrackCatalog.serviceFees.find((entry) => entry.wilayaId === payload.state);
  const deliveryFee = Number(payload.delivery === 1 ? fee?.stopDeskFee ?? 0 : fee?.homeFee ?? 0);
  const now = new Date().toISOString();
  const order = {
    id, publicToken, createdAt: now, updatedAt: now, firstName: payload.firstName ?? null, lastName: payload.lastName ?? null,
    fullName: [payload.firstName, payload.lastName].filter(Boolean).join(' '), email: payload.email ?? null,
    phoneNumber1: payload.phoneNumber1, phoneNumber2: payload.phoneNumber2 ?? null, cartProducts: payload.cartProducts,
    orderProducts, delivery: payload.delivery, state: payload.state, city: payload.city, homeAddress: payload.homeAddress ?? null,
    productSubtotal, deliveryFee, totalAmount: productSubtotal + deliveryFee, promoCode: null, promoProductId: null,
    promoOriginalSubtotal: null, promoDiscountAmount: 0, promoFinalSubtotal: null, note: null, confirmed: 0,
    noAnswerCount: 0, confirmedAt: null, hasStatusHistory: false, statusHistory: [],
  };
  orders.set(id, order);
  return order;
}

function normalizeSearch(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىيى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}

function matchesSearch(item, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const brand = brands.find((entry) => entry.id === item.brandId);
  const category = categories.find((entry) => entry.id === item.categoryId);
  const document = normalizeSearch(`${item.title} ${item.titleAr ?? ''} ${item.description ?? ''} ${item.descriptionAr ?? ''} ${item.sku ?? ''} ${item.barcode ?? ''} ${item.slug ?? ''} ${item.mongoId ?? ''} ${brand?.name ?? ''} ${category?.name ?? ''} ${category?.nameAr ?? ''}`);
  if (document.includes(normalizedQuery)) return true;
  const words = document.split(' ');
  return normalizedQuery.split(' ').every((term) => (
    document.includes(term)
    || (term.length >= 4 && words.some((word) => editDistance(term, word) <= Math.min(2, Math.max(1, Math.floor(term.length * 0.2)))))
  ));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4311');
  if (request.method === 'POST' && url.pathname === '/storefront/orders') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        send(response, json({ ok: true, item: createOrder(payload) }, 201));
      } catch {
        send(response, json({ error: 'Invalid order' }, 400));
      }
    });
    return;
  }
  let result;
  if (request.method === 'POST' && url.pathname === '/storefront/analytics') {
    request.resume();
    result = json({ ok: true, queued: true });
  } else if (url.pathname === '/storefront/ecotrack/catalog') {
    result = json(ecotrackCatalog);
  } else if (/^\/storefront\/orders\/\d+$/.test(url.pathname)) {
    const order = orders.get(Number(url.pathname.split('/').at(-1)));
    result = order && url.searchParams.get('token') === order.publicToken ? json({ item: order }) : json({ error: 'Not found' }, 404);
  } else if (url.pathname === '/storefront/homepage') {
    result = json(homepage());
  } else if (url.pathname === '/storefront/products') {
    const search = url.searchParams.get('search') ?? '';
    const brandId = Number(url.searchParams.get('brandId')) || null;
    const categoryId = Number(url.searchParams.get('categoryId')) || null;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(1, Number(url.searchParams.get('limit')) || 50);
    const sortKey = url.searchParams.get('sortKey') ?? 'updatedAt';
    const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 1 : -1;
    const filtered = catalogProducts.filter((item) => (
      matchesSearch(item, search)
      && (!brandId || item.brandId === brandId)
      && (!categoryId || item.categoryId === categoryId)
    ));
    filtered.sort((left, right) => {
      const leftValue = sortKey === 'price' ? Number(left.price) : left[sortKey] ?? '';
      const rightValue = sortKey === 'price' ? Number(right.price) : right[sortKey] ?? '';
      return (typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue))) * sortDirection;
    });
    result = json({ items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length });
  } else if (url.pathname === '/storefront/brands') {
    result = json({ items: brands });
  } else if (url.pathname === '/storefront/categories') {
    result = json({ items: categories });
  } else if (url.pathname === '/storefront/products/unavailable') {
    result = json({ error: 'Unavailable' }, 503);
  } else if (url.pathname === '/storefront/products/missing') {
    result = json({ error: 'Not found' }, 404);
  } else if (url.pathname === '/storefront/products/desk-lamp' || url.pathname === '/storefront/products/legacy-lamp') {
    const requestedToken = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    result = json({
      item: product,
      resolution: {
        requestedToken,
        matchedBy: requestedToken === 'desk-lamp' ? 'slug' : 'mongoId',
        canonicalToken: 'desk-lamp',
      },
    });
  } else if (url.pathname === '/api/health') {
    result = json({ status: 'ok' });
  } else {
    result = json({ error: 'Not found' }, 404);
  }

  send(response, result);
});

server.listen(4311, '127.0.0.1');

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', close);
process.on('SIGINT', close);
