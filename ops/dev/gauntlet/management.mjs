import { randomUUID } from 'node:crypto';
import { runManagementAiHistory } from './management-ai-history.mjs';
import { runManagementCatalog } from './management-catalog.mjs';
import { runManagementOperations } from './management-operations.mjs';

// These journeys own only records named with this run's unique prefix.
export async function run(ctx) {
  const prefix = `Gauntlet ${ctx.runId}`.slice(0, 46);
  let serial = 0;
  const name = (label) => `${prefix} ${label} ${++serial}`;
  const api = async (request, path, options = {}) => {
    const response = await request.fetch(`${ctx.urls.admin}${path}`, {
      timeout: 60000,
      ...options,
    });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw.slice(0, 2000);
    }
    return { status: response.status(), body };
  };
  const ok = (result, expect) => {
    expect(result.status, JSON.stringify(result.body)).toBeGreaterThanOrEqual(200);
    expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
    return result.body;
  };
  const createProduct = async (request, expect, label, overrides = {}) => {
    const title = name(label);
    const data = {
      title,
      titleAr: 'منتج اختبار',
      description: 'Synthetic management QA product.',
      price: 4750,
      purchasePrice: 2750,
      inventoryQuantity: 20,
      active: true,
      inStock: true,
      sku: randomUUID(),
      barcode: randomUUID(),
      images: [],
      ...overrides,
    };
    ok(await api(request, '/api/products', { method: 'POST', data }), expect);
    const list = ok(
      await api(request, `/api/products?search=${encodeURIComponent(title)}&limit=50`),
      expect,
    );
    const item = list.items.find((candidate) => candidate.title === title);
    expect(item, 'Created product must be searchable immediately').toBeTruthy();
    return { ...item, payload: data };
  };
  const publicProduct = (request, product) =>
    request.get(`${ctx.urls.api}/storefront/products/${product.id}`);
  const createCategory = async (request, expect, label, parentId) => {
    const title = name(label);
    ok(
      await api(request, '/api/categories', {
        method: 'POST',
        data: { name: title, nameAr: 'فئة الاختبار', parentId },
      }),
      expect,
    );
    const list = ok(
      await api(
        request,
        `/api/categories?search=${encodeURIComponent(title)}&includeParentOptions=1`,
      ),
      expect,
    );
    const item = list.items.find((candidate) => candidate.name === title);
    expect(item).toBeTruthy();
    return item;
  };
  await runManagementCatalog({ ctx, api, name, ok, createCategory, createProduct, publicProduct });
  await runManagementOperations({ ctx, createProduct, ok, api, name, publicProduct });
  await runManagementAiHistory({ ctx, createProduct, api, ok, publicProduct, name });
}
