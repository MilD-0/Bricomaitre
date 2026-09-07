'use client';
import { getSortRuleState } from '../../../lib/multi-sort';
import { cn } from '../../../lib/utils';
import { MultiSortHeader } from '../../multi-sort-header';
import { Checkbox } from '../../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { Switch } from '../../ui/switch';
import { buildStorefrontProductHref } from '../storefront-links';
import { ProductThumbnail, formatDate, formatMoney, formatPercent } from './use-workspace';
import type { ProductsWorkspaceView } from './workspace-view';
export function ProductLedger({
  t,
  visibleProducts,
  selectedIds,
  setSelectedIds,
  sortRules,
  toggleSort,
  storefrontBaseUrl,
  locale,
  patchMutation,
  setEditorState,
  setDeleteTarget,
}: Pick<
  Parameters<typeof ProductsWorkspaceView>[0],
  | 't'
  | 'visibleProducts'
  | 'selectedIds'
  | 'setSelectedIds'
  | 'sortRules'
  | 'toggleSort'
  | 'storefrontBaseUrl'
  | 'locale'
  | 'patchMutation'
  | 'setEditorState'
  | 'setDeleteTarget'
>) {
  return (
    <table className="w-full min-w-[1160px] border-collapse text-sm">
      <thead className="bg-muted/30 text-xs uppercase tracking-[var(--type-tracking-p080)] text-muted-foreground">
        <tr className="border-b border-border/60">
          <th className="w-12 px-3 py-3 text-start">
            <Checkbox
              aria-label={t('labels.selectAll')}
              checked={
                visibleProducts.length > 0 &&
                visibleProducts.every((product) => selectedIds.includes(product.id))
              }
              onChange={(event) =>
                setSelectedIds(event.target.checked ? visibleProducts.map((item) => item.id) : [])
              }
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('adminWorkspace.products.product')}
              sortState={getSortRuleState(sortRules, 'title')}
              onClick={() => toggleSort('title')}
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('labels.price')}
              sortState={getSortRuleState(sortRules, 'price')}
              onClick={() => toggleSort('price')}
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('labels.purchasePrice')}
              sortState={getSortRuleState(sortRules, 'purchasePrice')}
              onClick={() => toggleSort('purchasePrice')}
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">{t('labels.purchases')}</th>
          <th className="px-3 py-3 text-start font-medium">{t('labels.confirmationRate')}</th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('labels.active')}
              sortState={getSortRuleState(sortRules, 'active')}
              onClick={() => toggleSort('active')}
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('labels.inStock')}
              sortState={getSortRuleState(sortRules, 'inStock')}
              onClick={() => toggleSort('inStock')}
            />
          </th>
          <th className="px-3 py-3 text-start font-medium">
            <MultiSortHeader
              label={t('labels.modified')}
              sortState={getSortRuleState(sortRules, 'updatedAt')}
              onClick={() => toggleSort('updatedAt')}
            />
          </th>
          <th className="sticky end-0 z-10 w-12 bg-muted px-3 py-3" />
        </tr>
      </thead>
      <tbody>
        {visibleProducts.map((product, index) => (
          <tr
            key={product.id}
            className={cn(
              'border-b border-border/50 transition-colors hover:bg-primary/[0.035]',
              index % 2 === 1 && 'bg-muted/[0.14]',
            )}
          >
            <td className="px-3 py-3">
              <Checkbox
                aria-label={t('labels.selectRow', { name: product.title })}
                checked={selectedIds.includes(product.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, product.id])]
                      : current.filter((id) => id !== product.id),
                  )
                }
              />
            </td>
            <td className="px-3 py-3">
              <div className="flex max-w-[26rem] items-center gap-3 text-start">
                <ProductThumbnail product={product} />
                <span className="min-w-0">
                  <a
                    href={buildStorefrontProductHref(product, storefrontBaseUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                  >
                    {product.title}
                  </a>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {product.sku || t('adminWorkspace.products.noSku')}
                  </span>
                </span>
              </div>
            </td>
            <td className="px-3 py-3 font-medium tabular-nums">
              {formatMoney(locale, product.price)}
            </td>
            <td className="px-3 py-3 text-muted-foreground tabular-nums">
              {formatMoney(locale, product.purchasePrice)}
            </td>
            <td className="px-3 py-3 tabular-nums">{product.orderPurchaseCount}</td>
            <td className="px-3 py-3 tabular-nums">
              {formatPercent(locale, product.confirmationRate)}
            </td>
            <td className="px-3 py-3">
              <Switch
                checked={product.active}
                aria-label={`${t('labels.active')} · ${product.title}`}
                disabled={patchMutation.isPending}
                onCheckedChange={(active) =>
                  patchMutation.mutate({ id: product.id, values: { active } })
                }
              />
            </td>
            <td className="px-3 py-3">
              <Switch
                checked={product.inStock}
                aria-label={`${t('labels.inStock')} · ${product.title}`}
                disabled={patchMutation.isPending}
                onCheckedChange={(inStock) =>
                  patchMutation.mutate({ id: product.id, values: { inStock } })
                }
              />
            </td>
            <td className="px-3 py-3 text-xs text-muted-foreground">
              {formatDate(locale, product.updatedAt)}
            </td>
            <td className="sticky end-0 z-10 bg-background px-3 py-3 shadow-[var(--elevation-sticky-end)] rtl:shadow-[var(--elevation-sticky-start)]">
              <CompactMenu
                label={`${t('labels.actions')} · ${product.title}`}
                side={index >= visibleProducts.length - 2 ? 'top' : 'bottom'}
              >
                <CompactMenuItem onClick={() => setEditorState({ mode: 'edit', product })}>
                  {t('actions.edit')}
                </CompactMenuItem>
                <CompactMenuItem
                  destructive
                  onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                >
                  {t('adminWorkspace.products.archive')}
                </CompactMenuItem>
              </CompactMenu>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
