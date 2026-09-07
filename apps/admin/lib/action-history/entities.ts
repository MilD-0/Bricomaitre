import {
  adCosts,
  assetBanners,
  brands,
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinReplyReactions,
  categories,
  featuredProductGroups,
  importBatches,
  orders,
  processedOrderProducts,
  processedOrders,
  productCards,
  products,
  roleDefinitionPermissions,
  roleDefinitions,
  userAccessGrants,
} from '@bric/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  fetchFeaturedGroupState,
  fetchOrderState,
  fetchProductState,
  insertFeaturedGroupState,
  insertOrderState,
  insertProductState,
  snapshotValues,
  updateFeaturedGroupState,
  updateOrderState,
  updateProductState,
} from '../action-history-state';
import { normalizePermissions } from '../permissions';
import {
  type Database,
  type MutableEntityConfig,
  type SnapshotRecord,
  type Transaction,
} from './contract';

const bulletinRelatedTables = {
  tags: bulletinPostTags,
  attachments: bulletinPostAttachments,
  replies: bulletinReplies,
  reactions: bulletinPostReactions,
  replyReactions: bulletinReplyReactions,
};

async function restoreBulletinRows(
  tx: Transaction,
  snapshot: SnapshotRecord,
  keys: Array<keyof typeof bulletinRelatedTables>,
) {
  for (const key of keys) {
    const rows = snapshot[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    const table = bulletinRelatedTables[key];
    await tx
      .insert(table)
      .values(rows.map((row) => snapshotValues(table, row as SnapshotRecord)) as never);
  }
}

async function fetchBulletinPostState(tx: Database | Transaction, entityId: number) {
  const [post] = await tx
    .select()
    .from(bulletinPosts)
    .where(eq(bulletinPosts.id, entityId))
    .limit(1);
  if (!post) return null;
  const tags = await tx
    .select()
    .from(bulletinPostTags)
    .where(eq(bulletinPostTags.postId, entityId))
    .orderBy(asc(bulletinPostTags.tagId));
  const attachments = await tx
    .select()
    .from(bulletinPostAttachments)
    .where(eq(bulletinPostAttachments.postId, entityId))
    .orderBy(asc(bulletinPostAttachments.id));
  const replies = await tx
    .select()
    .from(bulletinReplies)
    .where(eq(bulletinReplies.postId, entityId))
    .orderBy(asc(bulletinReplies.id));
  const reactions = await tx
    .select()
    .from(bulletinPostReactions)
    .where(eq(bulletinPostReactions.postId, entityId))
    .orderBy(asc(bulletinPostReactions.id));
  const replyReactions = replies.length
    ? await tx
        .select()
        .from(bulletinReplyReactions)
        .where(
          inArray(
            bulletinReplyReactions.replyId,
            replies.map((reply) => reply.id),
          ),
        )
        .orderBy(asc(bulletinReplyReactions.id))
    : [];
  return { ...post, tags, attachments, replies, reactions, replyReactions };
}

const entityConfigs: Record<string, MutableEntityConfig> = {
  products: {
    resource: 'products',
    table: products,
    label: (row) => String(row.title ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchProductState,
    insertState: insertProductState,
    updateState: updateProductState,
  },
  orders: {
    resource: 'orders',
    table: orders,
    label: (row) =>
      String(
        ([row.firstName, row.lastName].filter(Boolean).join(' ') || row.phoneNumber1) ??
          `#${row.id ?? 'unknown'}`,
      ),
    fetchState: fetchOrderState,
    insertState: insertOrderState,
    updateState: updateOrderState,
  },
  assets: {
    resource: 'assets',
    table: importBatches,
    label: (row) => String(row.fileName ?? row.batchId ?? `#${row.id ?? 'unknown'}`),
  },
  assetBanners: {
    resource: 'assets',
    table: assetBanners,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
  },
  featuredProductGroups: {
    resource: 'assets',
    table: featuredProductGroups,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchFeaturedGroupState,
    insertState: insertFeaturedGroupState,
    updateState: updateFeaturedGroupState,
  },
  productCards: {
    resource: 'assets',
    table: productCards,
    label: (row) => String(row.titleFr ?? row.titleAr ?? `#${row.id ?? 'unknown'}`),
  },
  bulletinPosts: {
    resource: 'bulletin',
    table: bulletinPosts,
    label: (row) => String(row.title ?? `#${row.id ?? 'unknown'}`),
    fetchState: fetchBulletinPostState,
    insertState: async (tx, snapshot) => {
      await tx.insert(bulletinPosts).values(snapshotValues(bulletinPosts, snapshot));
      await restoreBulletinRows(tx, snapshot, [
        'tags',
        'attachments',
        'replies',
        'reactions',
        'replyReactions',
      ]);
    },
    updateState: async (tx, entityId, snapshot) => {
      await tx
        .update(bulletinPosts)
        .set(snapshotValues(bulletinPosts, snapshot))
        .where(eq(bulletinPosts.id, entityId));
      // Post edits own tags and attachments. Replies and reactions may have been
      // added independently since that edit and must not be replaced by undo.
      if (Array.isArray(snapshot.tags)) {
        await tx.delete(bulletinPostTags).where(eq(bulletinPostTags.postId, entityId));
      }
      if (Array.isArray(snapshot.attachments)) {
        await tx
          .delete(bulletinPostAttachments)
          .where(eq(bulletinPostAttachments.postId, entityId));
      }
      await restoreBulletinRows(tx, snapshot, ['tags', 'attachments']);
    },
  },
  bulletinReplies: {
    resource: 'bulletin',
    table: bulletinReplies,
    label: (row) => String(row.body ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [reply] = await tx
        .select()
        .from(bulletinReplies)
        .where(eq(bulletinReplies.id, entityId))
        .limit(1);
      if (!reply) return null;
      const replyReactions = await tx
        .select()
        .from(bulletinReplyReactions)
        .where(eq(bulletinReplyReactions.replyId, entityId))
        .orderBy(asc(bulletinReplyReactions.id));
      return { ...reply, replyReactions };
    },
    insertState: async (tx, snapshot) => {
      await tx.insert(bulletinReplies).values(snapshotValues(bulletinReplies, snapshot));
      await restoreBulletinRows(tx, snapshot, ['replyReactions']);
    },
  },
  bulletinPostReactions: {
    resource: 'bulletin',
    table: bulletinPostReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  bulletinReplyReactions: {
    resource: 'bulletin',
    table: bulletinReplyReactions,
    label: (row) =>
      String(
        `${row.emoji ?? 'reaction'} ${row.userName ?? row.userEmail ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  brandsCategories: {
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  brands: {
    resource: 'brandsCategories',
    table: brands,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  categories: {
    resource: 'brandsCategories',
    table: categories,
    label: (row) => String(row.name ?? `#${row.id ?? 'unknown'}`),
  },
  statsAdCosts: {
    resource: 'stats',
    table: adCosts,
    label: (row) =>
      String(
        row.campaignName ?? `${row.platform ?? 'ad'} ${row.date ?? `#${row.id ?? 'unknown'}`}`,
      ),
  },
  statsManualOrders: {
    resource: 'stats',
    table: processedOrders,
    label: (row) => String(row.tracking ?? row.orderId ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [order] = await tx
        .select()
        .from(processedOrders)
        .where(eq(processedOrders.id, entityId))
        .limit(1);

      if (!order) {
        return null;
      }

      const products = await tx
        .select()
        .from(processedOrderProducts)
        .where(eq(processedOrderProducts.processedOrderId, entityId))
        .orderBy(asc(processedOrderProducts.id));

      return {
        ...order,
        products,
      };
    },
    insertState: async (tx, snapshot) => {
      const { products: productSnapshot, ...orderSnapshot } = snapshot;
      await tx.insert(processedOrders).values(snapshotValues(processedOrders, orderSnapshot));

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map((product) =>
              snapshotValues(processedOrderProducts, product as SnapshotRecord),
            ),
          );
      }
    },
    updateState: async (tx, entityId, snapshot) => {
      const { products: productSnapshot, ...orderSnapshot } = snapshot;
      await tx
        .update(processedOrders)
        .set(snapshotValues(processedOrders, orderSnapshot))
        .where(eq(processedOrders.id, entityId));

      await tx
        .delete(processedOrderProducts)
        .where(eq(processedOrderProducts.processedOrderId, entityId));

      if (Array.isArray(productSnapshot) && productSnapshot.length > 0) {
        await tx
          .insert(processedOrderProducts)
          .values(
            productSnapshot.map((product) =>
              snapshotValues(processedOrderProducts, product as SnapshotRecord),
            ),
          );
      }
    },
  },
  roleDefinitions: {
    resource: 'settings',
    table: roleDefinitions,
    label: (row) => String(row.name ?? row.slug ?? `#${row.id ?? 'unknown'}`),
    fetchState: async (tx, entityId) => {
      const [role] = await tx
        .select()
        .from(roleDefinitions)
        .where(eq(roleDefinitions.id, entityId))
        .limit(1);

      if (!role) {
        return null;
      }

      const permissions = await tx
        .select()
        .from(roleDefinitionPermissions)
        .where(eq(roleDefinitionPermissions.roleId, entityId))
        .orderBy(asc(roleDefinitionPermissions.permission));

      return {
        ...role,
        permissions: permissions.map((permission) => permission.permission),
      };
    },
    insertState: async (tx, snapshot) => {
      const { permissions, ...roleSnapshot } = snapshot;
      await tx.insert(roleDefinitions).values(snapshotValues(roleDefinitions, roleSnapshot));

      const normalizedPermissions = normalizePermissions(permissions);
      if (normalizedPermissions.length > 0) {
        await tx.insert(roleDefinitionPermissions).values(
          normalizedPermissions.map((permission) => ({
            roleId: Number(roleSnapshot.id),
            permission,
          })),
        );
      }
    },
    updateState: async (tx, entityId, snapshot) => {
      const { permissions, ...roleSnapshot } = snapshot;
      await tx
        .update(roleDefinitions)
        .set(snapshotValues(roleDefinitions, roleSnapshot))
        .where(eq(roleDefinitions.id, entityId));

      await tx
        .delete(roleDefinitionPermissions)
        .where(eq(roleDefinitionPermissions.roleId, entityId));

      const normalizedPermissions = normalizePermissions(permissions);
      if (normalizedPermissions.length > 0) {
        await tx.insert(roleDefinitionPermissions).values(
          normalizedPermissions.map((permission) => ({
            roleId: entityId,
            permission,
          })),
        );
      }
    },
  },
  userAccessGrants: {
    resource: 'settings',
    table: userAccessGrants,
    label: (row) => String(row.email ?? `#${row.id ?? 'unknown'}`),
  },
  ecotrackShipments: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.reference ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'}`,
      ),
  },
  ecotrackShipmentMajSync: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} MAJ sync`,
      ),
  },
  ecotrackShipmentTrackingSync: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(
        row.trackingNumber ??
          row.entityLabel ??
          `Order #${row.orderId ?? row.id ?? 'unknown'} tracking sync`,
      ),
  },
  ecotrackCatalogSyncRuns: {
    resource: 'ecotrack',
    reversible: false,
    label: (row) =>
      String(row.trigger ?? row.entityLabel ?? `ECOTRACK sync #${row.id ?? 'unknown'}`),
  },
};

export function getActionEntityConfig(entityType: string) {
  return entityConfigs[entityType] ?? null;
}
