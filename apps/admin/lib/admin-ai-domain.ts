import { getDb } from '@bric/db/client';
import {
  loadAdministrationAccessGrants,
  loadAdministrationRoles,
} from './admin-administration-data';
import { loadAssetsData, searchAssetProductOptions } from './admin-assets-data';
import { loadInventoryPageData } from './admin-inventory-data';
import { loadOrderDetail, loadOrdersPageData } from './admin-orders-data';
import { loadAiProposalAssistantItems, type AiProposalAssistantScope } from './ai-proposal-inbox';
import { readBrandsPage, readCategoriesPage } from './brands-categories-api';
import { loadBulletinData } from './bulletin-server';
import { listLandingPages } from './landing-pages';
import type { PermissionKey } from './permissions';
import { readProductMutationPayload } from './product-update-workflow';

export async function findAdminProducts(input: {
  query?: string;
  productIds?: number[];
  page?: number;
  limit?: number;
}) {
  return searchAssetProductOptions({
    search: input.query ?? '',
    ids: input.productIds ?? [],
    page: input.page ?? 1,
    limit: input.limit ?? 10,
  });
}

export async function inspectAdminProducts(input: {
  query?: string;
  productIds?: number[];
  page?: number;
  limit?: number;
  brandQuery?: string;
  categoryQuery?: string;
}) {
  const hasProductScope = Boolean(input.query?.trim() || input.productIds?.length);
  const [matches, brandMatches, categoryMatches] = await Promise.all([
    hasProductScope
      ? findAdminProducts(input)
      : Promise.resolve({
          items: [],
          page: input.page ?? 1,
          limit: input.limit ?? 10,
          total: 0,
          totalPages: 1,
        }),
    input.brandQuery?.trim()
      ? findAdminBrands({ query: input.brandQuery, limit: input.limit })
      : Promise.resolve(null),
    input.categoryQuery?.trim()
      ? findAdminCategories({ query: input.categoryQuery, limit: input.limit })
      : Promise.resolve(null),
  ]);
  const db = getDb();
  const inspected = await Promise.all(
    matches.items.map(async (match) => ({
      id: match.id,
      ...(await readProductMutationPayload(db, match.id)),
    })),
  );
  return {
    ...matches,
    items: inspected,
    taxonomyMatches: { brands: brandMatches, categories: categoryMatches },
  };
}

export async function findAdminBrands(input: { query: string; limit?: number }) {
  const data = await readBrandsPage({ page: 1, limit: input.limit ?? 10, search: input.query });
  return {
    items: data.items.map(({ id, name, slug, isActive, featured, productCount }) => ({
      id: Number(id),
      name,
      slug,
      isActive,
      featured,
      productCount,
    })),
    total: data.pagination.totalItems,
  };
}

export async function findAdminCategories(input: { query: string; limit?: number }) {
  const data = await readCategoriesPage(
    { page: 1, limit: input.limit ?? 10, search: input.query },
    false,
  );
  return {
    items: data.items.map(
      ({ id, name, nameAr, slug, parentId, parentName, isActive, featured, productCount }) => ({
        id: Number(id),
        name,
        nameAr,
        slug,
        parentId: parentId ? Number(parentId) : null,
        parentName,
        isActive,
        featured,
        productCount,
      }),
    ),
    total: data.pagination.totalItems,
  };
}

function assistantOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrderDetail>>>) {
  return {
    id: order.id,
    publicToken: order.publicToken,
    ecotrackTrackingNumber: order.ecotrackTrackingNumber,
    variant: order.variant,
    isDegradedCapture: order.isDegradedCapture,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.confirmed,
    noAnswerCount: order.noAnswerCount,
    customer: {
      firstName: order.firstName,
      lastName: order.lastName,
      fullName: order.fullName,
      email: order.email,
      phoneNumber1: order.phoneNumber1,
      phoneNumber2: order.phoneNumber2,
      note: order.note,
    },
    delivery: {
      type: order.delivery,
      state: order.state,
      city: order.city,
      homeAddress: order.homeAddress,
    },
    subtotalOverride: order.subtotalOverride,
    productSubtotal: order.productSubtotal,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    promotion: {
      code: order.promoCode,
      productId: order.promoProductId,
      originalSubtotal: order.promoOriginalSubtotal,
      discountAmount: order.promoDiscountAmount,
      finalSubtotal: order.promoFinalSubtotal,
    },
    products: order.orderProducts.map((product) => ({
      productId: product.productId,
      brandId: product.brandId,
      slug: product.slug,
      rawValue: product.rawValue,
      title: product.title,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      lineTotal: product.lineTotal,
      thumbnailUrl: product.thumbnailUrl,
      missing: product.missing,
    })),
    statusHistory: order.statusHistory.map((entry) => ({
      status: entry.status,
      noAnswerCount: entry.noAnswerCount,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy,
      changedByName: entry.changedByName,
    })),
    confirmedBy: order.confirmedBy,
    confirmedByName: order.confirmedByName,
    confirmedAt: order.confirmedAt,
  };
}

export async function inspectAdminOrders(input: {
  orderIds?: number[];
  status?: number;
  noAnswerCount?: number;
  limit?: number;
}) {
  const orderIds = [...new Set(input.orderIds ?? [])].slice(0, 50);
  if (orderIds.length > 0) {
    const orders = await Promise.all(orderIds.map((id) => loadOrderDetail(id)));
    return {
      items: orders.flatMap((order) => (order ? [assistantOrder(order)] : [])),
      requestedIds: orderIds,
      missingIds: orderIds.filter((id, index) => orders[index] === null),
    };
  }

  const data = await loadOrdersPageData(
    {
      page: 1,
      limit: input.limit ?? 20,
      confirmed: input.status,
      noAnswerCount: input.noAnswerCount,
    },
    false,
  );
  return { items: data.items.map(assistantOrder), pagination: data.pagination };
}

export async function inspectAdminInventory(input: {
  productIds?: number[];
  query?: string;
  page?: number;
  limit?: number;
}) {
  return loadInventoryPageData(
    {
      page: input.page ?? 1,
      limit: input.limit ?? 20,
      search: input.query ?? '',
    },
    false,
    input.productIds ?? [],
  );
}

export async function inspectAdminAssets(input: {
  kind?: 'all' | 'banners' | 'featuredGroups' | 'productCards';
  ids?: number[];
  limit?: number;
  productQuery?: string;
  brandQuery?: string;
  categoryQuery?: string;
}) {
  const data = await loadAssetsData();
  const ids = new Set(input.ids ?? []);
  const limit = input.limit ?? 20;
  const selected = <T extends { id: number }>(items: T[]) =>
    items.filter((item) => ids.size === 0 || ids.has(item.id)).slice(0, limit);
  const kind = input.kind ?? 'all';
  const [productMatches, brandMatches, categoryMatches] = await Promise.all([
    input.productQuery?.trim()
      ? findAdminProducts({ query: input.productQuery, limit })
      : Promise.resolve(null),
    input.brandQuery?.trim()
      ? findAdminBrands({ query: input.brandQuery, limit })
      : Promise.resolve(null),
    input.categoryQuery?.trim()
      ? findAdminCategories({ query: input.categoryQuery, limit })
      : Promise.resolve(null),
  ]);

  return {
    ...(kind === 'all' || kind === 'banners' ? { banners: selected(data.banners) } : {}),
    ...(kind === 'all' || kind === 'featuredGroups'
      ? { featuredGroups: selected(data.featuredGroups) }
      : {}),
    ...(kind === 'all' || kind === 'productCards'
      ? { productCards: selected(data.productCards) }
      : {}),
    totals: {
      banners: data.banners.length,
      featuredGroups: data.featuredGroups.length,
      productCards: data.productCards.length,
    },
    matches: {
      products: productMatches,
      brands: brandMatches,
      categories: categoryMatches,
    },
  };
}

export async function inspectAdminLandingPages(input: {
  landingPageIds?: number[];
  productIds?: number[];
  query?: string;
  limit?: number;
}) {
  const landingPageIds = new Set(input.landingPageIds ?? []);
  const productIds = new Set(input.productIds ?? []);
  const query = input.query?.trim().toLocaleLowerCase() ?? '';
  const pages = (await listLandingPages())
    .filter(
      (page) =>
        (landingPageIds.size === 0 || landingPageIds.has(page.id)) &&
        (productIds.size === 0 || productIds.has(page.productId)) &&
        (!query ||
          page.productTitle.toLocaleLowerCase().includes(query) ||
          page.slug.toLocaleLowerCase().includes(query)),
    )
    .slice(0, input.limit ?? 10);

  return {
    items: pages,
    requestedLandingPageIds: [...landingPageIds],
    missingLandingPageIds: [...landingPageIds].filter(
      (id) => !pages.some((page) => page.id === id),
    ),
  };
}

export async function inspectAdminProposals(input: {
  scopes: AiProposalAssistantScope[];
  proposalIds?: number[];
  query?: string;
  limit?: number;
}) {
  return loadAiProposalAssistantItems(getDb(), {
    scopes: input.scopes,
    ids: input.proposalIds,
    search: input.query,
    limit: input.limit,
  });
}

export async function inspectAdminBulletin(input: {
  query?: string;
  limit?: number;
  viewer: { userId: string | null; permissions: PermissionKey[] };
}) {
  const data = await loadBulletinData(input.viewer);
  const query = input.query?.trim().toLocaleLowerCase() ?? '';
  const posts = data.posts
    .filter(
      (post) =>
        !query ||
        post.title.toLocaleLowerCase().includes(query) ||
        post.body.toLocaleLowerCase().includes(query) ||
        post.tags.some((tag) => tag.toLocaleLowerCase().includes(query)),
    )
    .slice(0, input.limit ?? 20)
    .map((post) => post);

  return { posts, availableTags: data.availableTags, total: data.posts.length };
}

export async function inspectAdminAdministration() {
  const [access, roles] = await Promise.all([
    loadAdministrationAccessGrants(),
    loadAdministrationRoles(),
  ]);
  return {
    accessGrantCount: access.items.length,
    accessGrants: access.items,
    customRoles: roles.items.map(({ id, name, slug, description, permissions }) => ({
      id,
      name,
      slug,
      description,
      permissions,
    })),
    availablePermissions: roles.availablePermissions,
  };
}
