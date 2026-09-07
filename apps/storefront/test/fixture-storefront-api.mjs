import { createServer } from 'node:http';
import {
  catalogProducts,
  categories,
  ecotrackCatalog,
  landingPage,
  product,
} from './fixture-catalog.mjs';
import { fixtureApiOrigin, fixtureApiPort } from './fixture-config.mjs';
import { brands, homepage, homepageFixtureAssets } from './fixture-homepage.mjs';
import { createOrder, json, orders, send } from './fixture-orders.mjs';
import { matchesSearch } from './fixture-search.mjs';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', fixtureApiOrigin);
  const fixtureAsset = homepageFixtureAssets.get(url.pathname);
  if (request.method === 'GET' && fixtureAsset) {
    send(response, { status: 200, body: fixtureAsset, type: 'image/svg+xml' });
    return;
  }
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
  if (request.method === 'POST' && url.pathname === '/storefront/products/validate') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const ids = new Set(Array.isArray(payload.productIds) ? payload.productIds : []);
        send(response, json({ items: catalogProducts.filter((item) => ids.has(item.id)) }));
      } catch {
        send(response, json({ error: 'Invalid cart validation' }, 400));
      }
    });
    return;
  }
  let result;
  if (request.method === 'POST' && url.pathname === '/storefront/analytics') {
    request.resume();
    result = json({ ok: true, queued: true });
  } else if (request.method === 'POST' && url.pathname === '/storefront/meta/events') {
    request.resume();
    result = json({ ok: true, queued: true }, 202);
  } else if (url.pathname === '/storefront/ecotrack/catalog') {
    result = json(ecotrackCatalog);
  } else if (request.method === 'POST' && url.pathname === '/storefront/orders/track') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const { token } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const order = [...orders.values()].find((candidate) => candidate.publicToken === token);
        send(response, order ? json({ item: order }) : json({ error: 'Not found' }, 404));
      } catch {
        send(response, json({ error: 'Invalid tracking request' }, 400));
      }
    });
    return;
  } else if (url.pathname === '/storefront/homepage') {
    result = json(homepage());
  } else if (
    ['lampe-fr', 'lampe-ar', 'lampe-fr-only', 'lampe-ar-only'].some(
      (slug) => url.pathname === `/storefront/landing-pages/${slug}`,
    )
  ) {
    const locale = url.searchParams.get('locale');
    const only = url.pathname.endsWith('-only');
    const contentLocale = only ? (url.pathname.endsWith('ar-only') ? 'ar' : 'fr') : locale;
    result = json({
      ...landingPage(contentLocale),
      slug: only ? url.pathname.split('/').at(-1) : `lampe-${locale}`,
    });
  } else if (url.pathname === '/storefront/landing-pages/unavailable') {
    result = json({ error: 'Unavailable' }, 503);
  } else if (url.pathname === '/storefront/landing-pages/lampe-atelier') {
    const locale = url.searchParams.get('locale');
    result =
      locale === 'fr' || locale === 'ar'
        ? json(landingPage(locale))
        : json({ error: 'Invalid locale' }, 400);
  } else if (url.pathname === '/storefront/landing-pages') {
    result = json({ items: [] });
  } else if (url.pathname === '/storefront/products/build-feed') {
    result = json({
      items: catalogProducts.map(({ id, slug, mongoId, updatedAt }) => ({
        id,
        slug,
        mongoId,
        updatedAt,
      })),
    });
  } else if (url.pathname === '/storefront/products') {
    const search = url.searchParams.get('search') ?? '';
    const brandId = Number(url.searchParams.get('brandId')) || null;
    const categoryId = Number(url.searchParams.get('categoryId')) || null;
    const stock = url.searchParams.get('stock') ?? 'all';
    const discounted = url.searchParams.get('discounted') === '1';
    const minPrice = Number(url.searchParams.get('minPrice')) || null;
    const maxPrice = Number(url.searchParams.get('maxPrice')) || null;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(1, Number(url.searchParams.get('limit')) || 50);
    const sortKey = url.searchParams.get('sortKey') ?? 'updatedAt';
    const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 1 : -1;
    const filtered = catalogProducts.filter(
      (item) =>
        matchesSearch(item, search) &&
        (!brandId || item.brandId === brandId) &&
        (!categoryId || item.categoryId === categoryId) &&
        (stock === 'all' || (stock === 'in' ? item.inStock : !item.inStock)) &&
        (!discounted || (item.oldPrice !== null && Number(item.oldPrice) > Number(item.price))) &&
        (!minPrice || Number(item.price) >= minPrice) &&
        (!maxPrice || Number(item.price) <= maxPrice),
    );
    filtered.sort((left, right) => {
      const leftValue = sortKey === 'price' ? Number(left.price) : (left[sortKey] ?? '');
      const rightValue = sortKey === 'price' ? Number(right.price) : (right[sortKey] ?? '');
      return (
        (typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue))) * sortDirection
      );
    });
    result = json({
      items: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
    });
  } else if (url.pathname === '/storefront/brands') {
    result = json({ items: brands });
  } else if (url.pathname === '/storefront/categories') {
    result = json({ items: categories });
  } else if (url.pathname === '/storefront/products/unavailable') {
    result = json({ error: 'Unavailable' }, 503);
  } else if (url.pathname === '/storefront/products/missing') {
    result = json({ error: 'Not found' }, 404);
  } else if (
    url.pathname === '/storefront/products/desk-lamp' ||
    url.pathname === '/storefront/products/legacy-lamp'
  ) {
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

server.listen(fixtureApiPort, '127.0.0.1');

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', close);

process.on('SIGINT', close);
