import { sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { orderLineItems, orders, products } from '@bric/db/schema';

// EXISTS preserves one result per order, including orders with several matching lines.
export function orderProductSearchCondition(search: string) {
  const item = alias(orderLineItems, 'search_item');
  const product = alias(products, 'search_product');
  const term = search
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
  return sql<boolean>`exists (
    select 1 from ${orderLineItems} as ${item}
    left join ${products} as ${product} on ${product.id} = ${item.productId}
    where ${item.orderId} = ${orders.id}
      and position(${term} in regexp_replace(normalize(lower(concat_ws(' ',
        ${item.titleSnapshot}, ${item.rawValue}, ${product.title}, ${product.titleAr},
        ${product.sku}, ${product.slug}
      )), NFD), '[\u0300-\u036f]', '', 'g')) > 0
  )`;
}
