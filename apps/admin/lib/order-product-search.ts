import { sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { orderLineItems, orders, products } from '@bric/db/schema';

// Search each distinct snapshot once, then join its matching units. Normalizing
// the same catalog text across a million historical lines wastes customer-facing
// database capacity. LIKE also gives the planner useful substring selectivity.
export function orderProductSearchCondition(search: string) {
  const item = alias(orderLineItems, 'search_item');
  const product = alias(products, 'search_product');
  const term = search
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  return sql<boolean>`${orders.id} in (
    with search_documents as materialized (
      select product_id, title_snapshot, raw_value from ${orderLineItems}
      group by product_id, title_snapshot, raw_value
    ), matching_documents as materialized (
      select document.product_id, document.title_snapshot, document.raw_value
      from search_documents document
      left join ${products} as ${product} on ${product.id} = document.product_id
      where regexp_replace(normalize(lower(concat_ws(' ',
        document.title_snapshot, document.raw_value, ${product.title}, ${product.titleAr},
        ${product.sku}, ${product.slug}
      )), NFD), '[\u0300-\u036f]', '', 'g') like ${pattern}
    )
    select ${item.orderId} from ${orderLineItems} as ${item}
    where exists (select 1 from matching_documents document
      where coalesce(document.product_id, 0) = coalesce(${item.productId}, 0)
      and document.title_snapshot = ${item.titleSnapshot}
      and document.raw_value = ${item.rawValue}
    )
  )`;
}
