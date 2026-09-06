import { sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { orderLineItems, orders, products } from '@bric/db/schema';

// An uncorrelated set lets PostgreSQL find matching lines once instead of
// normalizing every line again for each candidate order. IN preserves one row per order.
export function orderProductSearchCondition(search: string) {
  const item = alias(orderLineItems, 'search_item');
  const product = alias(products, 'search_product');
  const term = search
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
  return sql<boolean>`${orders.id} in (
    select ${item.orderId} from ${orderLineItems} as ${item}
    left join ${products} as ${product} on ${product.id} = ${item.productId}
    where position(${term} in regexp_replace(normalize(lower(concat_ws(' ',
        ${item.titleSnapshot}, ${item.rawValue}, ${product.title}, ${product.titleAr},
        ${product.sku}, ${product.slug}
      )), NFD), '[\u0300-\u036f]', '', 'g')) > 0
  )`;
}
